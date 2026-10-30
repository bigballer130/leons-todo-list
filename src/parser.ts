import {
  addDays, addMonths, firstOccurrence, fromISO, pad, startOfWeek, toISO, todayISO, weekday, WEEKDAYS_SHORT,
} from './dates';
import type { Due, Label, Priority, Project, Recurrence, Section } from './types';

export type TokenType = 'date' | 'priority' | 'project' | 'section' | 'label';

export interface Token {
  start: number;
  end: number;
  type: TokenType;
  text: string;
}

export interface ParsedDate {
  date?: string;
  time?: string;
  recurrence?: Recurrence;
}

const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WD_FULL = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const WD_ANY = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';
const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM_RE = `\\d+|${Object.keys(NUM_WORDS).join('|')}`;

const B = '(?<![\\w#@/])'; // left boundary
const E = '(?![\\w])'; // right boundary

const wdIndex = (s: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(s.slice(0, 3).toLowerCase());
const monthIndex = (s: string) =>
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase());
const toNum = (s: string) => NUM_WORDS[s.toLowerCase()] ?? parseInt(s, 10);

function nextWeekday(from: string, wd: number, includeToday = false): string {
  let d = includeToday ? from : addDays(from, 1);
  while (weekday(d) !== wd) d = addDays(d, 1);
  return d;
}

function makeDate(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m, d);
  if (dt.getMonth() !== m || dt.getDate() !== d) return null;
  return toISO(dt);
}

/** Month/day without a year → the next time that date comes around. */
function upcomingDate(m: number, d: number, year: number | undefined, today: string): string | null {
  const ty = fromISO(today).getFullYear();
  if (year !== undefined) return makeDate(year < 100 ? 2000 + year : year, m, d);
  const thisYear = makeDate(ty, m, d);
  if (thisYear && thisYear >= today) return thisYear;
  return makeDate(ty + 1, m, d);
}

function to24(h: number, min: number, ampm?: string): string | null {
  if (ampm) {
    const p = ampm.toLowerCase().startsWith('p');
    if (h < 1 || h > 12) return null;
    if (h === 12) h = p ? 12 : 0;
    else if (p) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

function weekdayListText(days: number[]) {
  return days.map((d) => WEEKDAYS_SHORT[d].toLowerCase()).join(', ');
}

interface Matcher {
  re: RegExp;
  apply: (m: RegExpExecArray, today: string, weekStart: number) => ParsedDate | null;
}

const matchers: Matcher[] = [
  // ---- recurrence ----
  {
    re: new RegExp(`${B}every\\s+((?:${WD_ANY})(?:\\s*(?:,|and|&)\\s*(?:${WD_ANY}))*)${E}`, 'gi'),
    apply: (m) => {
      const days = [...new Set(m[1].split(/\s*(?:,|and|&)\s*/i).map(wdIndex).filter((d) => d >= 0))].sort();
      return { recurrence: { freq: 'week', interval: 1, weekdays: days, text: `every ${weekdayListText(days)}` } };
    },
  },
  {
    re: new RegExp(`${B}every\\s+(?:weekday|workday|work\\s+day)${E}`, 'gi'),
    apply: () => ({ recurrence: { freq: 'day', interval: 1, workdays: true, text: 'every workday' } }),
  },
  {
    re: new RegExp(`${B}every\\s+(other\\s+|(${NUM_RE})\\s+)?(day|week|month|year)s?${E}`, 'gi'),
    apply: (m) => {
      const interval = m[1]?.trim().toLowerCase() === 'other' ? 2 : m[2] ? toNum(m[2]) : 1;
      const freq = m[3].toLowerCase() as Recurrence['freq'];
      const text = interval === 1 ? `every ${freq}` : `every ${interval} ${freq}s`;
      return { recurrence: { freq, interval, text } };
    },
  },
  {
    re: new RegExp(`${B}every\\s+(\\d{1,2})(?:st|nd|rd|th)${E}`, 'gi'),
    apply: (m) => {
      const day = parseInt(m[1], 10);
      if (day < 1 || day > 31) return null;
      return { recurrence: { freq: 'month', interval: 1, monthDay: day, text: `every ${m[1]}${ordinal(day)}` } };
    },
  },
  {
    re: new RegExp(`${B}every\\s+(morning|evening|night)${E}`, 'gi'),
    apply: (m) => {
      const w = m[1].toLowerCase();
      return {
        time: w === 'morning' ? '09:00' : w === 'evening' ? '19:00' : '22:00',
        recurrence: { freq: 'day', interval: 1, text: 'every day' },
      };
    },
  },
  {
    re: new RegExp(`${B}(daily|weekly|monthly|yearly|annually)${E}`, 'gi'),
    apply: (m) => {
      const w = m[1].toLowerCase();
      const freq = ({ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', annually: 'year' } as const)[
        w as 'daily'
      ];
      return { recurrence: { freq, interval: 1, text: `every ${freq}` } };
    },
  },
  // ---- absolute dates ----
  {
    re: new RegExp(`${B}(?:(?:on|due|by)\\s+)?(\\d{4})-(\\d{1,2})-(\\d{1,2})${E}`, 'gi'),
    apply: (m) => {
      const d = makeDate(+m[1], +m[2] - 1, +m[3]);
      return d ? { date: d } : null;
    },
  },
  {
    re: new RegExp(`${B}(?:(?:on|due|by)\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, 'gi'),
    apply: (m, today) => {
      const d = upcomingDate(monthIndex(m[1]), +m[2], m[3] ? +m[3] : undefined, today);
      return d ? { date: d } : null;
    },
  },
  {
    re: new RegExp(`${B}(?:(?:on|due|by)\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})(?:,?\\s+(\\d{4}))?${E}`, 'gi'),
    apply: (m, today) => {
      const d = upcomingDate(monthIndex(m[2]), +m[1], m[3] ? +m[3] : undefined, today);
      return d ? { date: d } : null;
    },
  },
  {
    re: new RegExp(`${B}(?:(?:on|due|by)\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?${E}`, 'gi'),
    apply: (m, today) => {
      const d = upcomingDate(+m[1] - 1, +m[2], m[3] ? +m[3] : undefined, today);
      return d ? { date: d } : null;
    },
  },
  // ---- relative dates ----
  {
    re: new RegExp(`${B}(today|tod|tonight|tomorrow|tmrw|tmr)${E}`, 'gi'),
    apply: (m, today) => {
      const w = m[1].toLowerCase();
      if (w === 'tonight') return { date: today, time: '20:00' };
      if (w === 'today' || w === 'tod') return { date: today };
      return { date: addDays(today, 1) };
    },
  },
  {
    re: new RegExp(`${B}(next|this)\\s+(week|month|year|weekend)${E}`, 'gi'),
    apply: (m, today, weekStart) => {
      const which = m[1].toLowerCase();
      const unit = m[2].toLowerCase();
      if (unit === 'weekend') {
        if (which === 'next') return { date: nextWeekday(addDays(startOfWeek(today, weekStart), 7), 6, true) };
        return { date: weekday(today) === 0 ? today : nextWeekday(today, 6, true) };
      }
      if (unit === 'week') {
        if (which === 'this') return { date: today };
        return { date: nextWeekday(today, weekStart) };
      }
      const t = fromISO(today);
      if (unit === 'month') return { date: which === 'this' ? today : toISO(new Date(t.getFullYear(), t.getMonth() + 1, 1)) };
      return { date: which === 'this' ? today : toISO(new Date(t.getFullYear() + 1, 0, 1)) };
    },
  },
  {
    re: new RegExp(`${B}(?:this\\s+)?weekend${E}`, 'gi'),
    apply: (_m, today) => ({ date: weekday(today) === 0 ? today : nextWeekday(today, 6, true) }),
  },
  {
    re: new RegExp(`${B}in\\s+(${NUM_RE})\\s+(day|week|month|year)s?${E}`, 'gi'),
    apply: (m, today) => {
      const n = toNum(m[1]);
      const unit = m[2].toLowerCase();
      if (unit === 'day') return { date: addDays(today, n) };
      if (unit === 'week') return { date: addDays(today, 7 * n) };
      if (unit === 'month') return { date: addMonths(today, n) };
      return { date: addMonths(today, 12 * n) };
    },
  },
  {
    // full weekday names always; abbreviations need a prefix for the ambiguous ones (sat, sun, wed)
    re: new RegExp(`${B}(?:(?:on|next|this|due|by)\\s+(${WD_ANY})|(${WD_FULL}|mon|tue|tues|thu|thur|thurs|fri))${E}`, 'gi'),
    apply: (m, today, weekStart) => {
      const word = m[1] ?? m[2];
      const wd = wdIndex(word);
      // "next friday" means the friday of next week
      if (/^next/i.test(m[0])) return { date: nextWeekday(addDays(startOfWeek(today, weekStart), 7), wd, true) };
      const d = nextWeekday(today, wd);
      return { date: d };
    },
  },
  // ---- times ----
  {
    re: new RegExp(`${B}(?:(?:at|@|by)\\s*)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.|a|p)(?![\\w.])`, 'gi'),
    apply: (m) => {
      const t = to24(+m[1], m[2] ? +m[2] : 0, m[3]);
      return t ? { time: t } : null;
    },
  },
  {
    re: new RegExp(`${B}(?:at\\s+)?([01]?\\d|2[0-3]):([0-5]\\d)${E}`, 'gi'),
    apply: (m) => ({ time: to24(+m[1], +m[2]) ?? undefined }),
  },
  {
    re: new RegExp(`${B}at\\s+(\\d{1,2})${E}(?!\\s*(?:${MONTH_RE}|/|:))`, 'gi'),
    apply: (m) => {
      let h = +m[1];
      if (h > 23) return null;
      if (h >= 1 && h <= 7) h += 12; // "at 5" almost always means 5 PM
      return { time: `${pad(h)}:00` };
    },
  },
  {
    re: new RegExp(`${B}(?:at\\s+)?(noon|midday|midnight)${E}`, 'gi'),
    apply: (m) => ({ time: m[1].toLowerCase() === 'midnight' ? '00:00' : '12:00' }),
  },
];

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

interface DateScan {
  parsed: ParsedDate;
  tokens: Token[];
}

/** Scan free text for date / time / recurrence phrases. */
export function scanDates(text: string, opts: { today?: string; weekStart?: number; ignore?: string[] } = {}): DateScan {
  const today = opts.today ?? todayISO();
  const weekStart = opts.weekStart ?? 1;
  const ignore = new Set((opts.ignore ?? []).map((s) => s.toLowerCase()));
  const taken: Array<[number, number]> = [];
  const tokens: Token[] = [];
  const parsed: ParsedDate = {};
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

  for (const { re, apply } of matchers) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end) || ignore.has(m[0].toLowerCase())) continue;
      const res = apply(m, today, weekStart);
      if (!res) continue;
      // first match of each kind wins
      const useful =
        (res.recurrence && !parsed.recurrence) || (res.date && !parsed.date) || (res.time && !parsed.time);
      if (!useful) continue;
      if (res.recurrence && !parsed.recurrence) parsed.recurrence = res.recurrence;
      if (res.date && !parsed.date) parsed.date = res.date;
      if (res.time && !parsed.time) parsed.time = res.time;
      taken.push([start, end]);
      tokens.push({ start, end, type: 'date', text: m[0] });
    }
  }
  return { parsed, tokens };
}

export function parsedToDue(p: ParsedDate, today = todayISO()): Due | null {
  if (!p.date && !p.time && !p.recurrence) return null;
  let date = p.date;
  if (!date && p.recurrence) date = firstOccurrence(p.recurrence, today);
  if (!date) date = today;
  return { date, time: p.time ?? null, recurrence: p.recurrence ?? null };
}

/** Parse a date string typed into a date field (e.g. "next fri at 3pm", "every monday"). */
export function parseDueText(text: string, weekStart = 1): Due | null {
  const { parsed } = scanDates(text, { weekStart });
  return parsedToDue(parsed);
}

export interface QuickAddResult {
  content: string;
  due: Due | null;
  priority?: Priority;
  projectId?: string;
  sectionId?: string;
  labels: string[];
  tokens: Token[];
}

interface QuickAddCtx {
  projects: Project[];
  sections: Section[];
  labels: Label[];
  weekStart: number;
  smartDate: boolean;
  /** project used to resolve /section when no #project is typed */
  currentProjectId?: string;
  ignore?: string[];
}

function matchNameAt(text: string, pos: number, names: string[]): string | null {
  const rest = text.slice(pos).toLowerCase();
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const n of sorted) {
    const ln = n.toLowerCase();
    if (rest.startsWith(ln) && !/[\w]/.test(rest.charAt(ln.length))) return n;
  }
  return null;
}

export function parseQuickAdd(text: string, ctx: QuickAddCtx): QuickAddResult {
  const tokens: Token[] = [];
  const result: QuickAddResult = { content: text, due: null, labels: [], tokens };

  // priority: p1 … p4
  const pr = /(?<![\w])p([1-4])(?![\w])/gi;
  let m: RegExpExecArray | null;
  while ((m = pr.exec(text))) {
    if (result.priority === undefined) {
      result.priority = Number(m[1]) as Priority;
      tokens.push({ start: m.index, end: m.index + m[0].length, type: 'priority', text: m[0] });
    }
  }

  // #project
  const activeProjects = ctx.projects.filter((p) => !p.archived);
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '#' || (i > 0 && !/\s/.test(text[i - 1]))) continue;
    const name = matchNameAt(text, i + 1, activeProjects.map((p) => p.name));
    if (name && !result.projectId) {
      result.projectId = activeProjects.find((p) => p.name.toLowerCase() === name.toLowerCase())!.id;
      tokens.push({ start: i, end: i + 1 + name.length, type: 'project', text: text.slice(i, i + 1 + name.length) });
    }
  }

  // /section (within the chosen or current project)
  const projectForSection = result.projectId ?? ctx.currentProjectId;
  if (projectForSection) {
    const secs = ctx.sections.filter((s) => s.projectId === projectForSection);
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '/' || (i > 0 && !/\s/.test(text[i - 1]))) continue;
      const name = matchNameAt(text, i + 1, secs.map((s) => s.name));
      if (name && !result.sectionId) {
        result.sectionId = secs.find((s) => s.name.toLowerCase() === name.toLowerCase())!.id;
        if (!result.projectId) result.projectId = projectForSection;
        tokens.push({ start: i, end: i + 1 + name.length, type: 'section', text: text.slice(i, i + 1 + name.length) });
      }
    }
  }

  // @label (existing names may contain spaces; unknown @words create new labels)
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || (i > 0 && !/\s/.test(text[i - 1]))) continue;
    let name = matchNameAt(text, i + 1, ctx.labels.map((l) => l.name));
    if (!name) {
      const w = /^[^\s@#]+/.exec(text.slice(i + 1));
      name = w ? w[0] : null;
    }
    if (name) {
      const existing = ctx.labels.find((l) => l.name.toLowerCase() === name!.toLowerCase());
      const final = existing ? existing.name : name;
      if (!result.labels.includes(final)) result.labels.push(final);
      tokens.push({ start: i, end: i + 1 + name.length, type: 'label', text: text.slice(i, i + 1 + name.length) });
    }
  }

  if (ctx.smartDate) {
    // blank out non-date tokens so dates aren't parsed inside them
    let masked = text;
    for (const t of tokens) masked = masked.slice(0, t.start) + ' '.repeat(t.end - t.start) + masked.slice(t.end);
    const scan = scanDates(masked, { weekStart: ctx.weekStart, ignore: ctx.ignore });
    result.due = parsedToDue(scan.parsed);
    tokens.push(...scan.tokens.map((t) => ({ ...t, text: text.slice(t.start, t.end) })));
  }

  tokens.sort((a, b) => a.start - b.start);
  result.content = stripTokens(text, tokens);
  return result;
}

export function stripTokens(text: string, tokens: Token[]): string {
  let out = '';
  let pos = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    out += text.slice(pos, t.start);
    pos = Math.max(pos, t.end);
  }
  out += text.slice(pos);
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function removeTokensOfType(text: string, tokens: Token[], types: TokenType[]): string {
  return stripTokens(text, tokens.filter((t) => types.includes(t.type)));
}
