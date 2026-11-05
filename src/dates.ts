import type { Due, Recurrence, Reminder } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(s: string, n: number): string {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function addMonths(s: string, n: number, preferredDay?: number): string {
  const d = fromISO(s);
  const day = preferredDay ?? d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toISO(d);
}

/** a - b in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

export function weekday(s: string): number {
  return fromISO(s).getDay();
}

export function startOfWeek(s: string, weekStart: number): string {
  return addDays(s, -((weekday(s) - weekStart + 7) % 7));
}

let timeFormat: '12h' | '24h' = '12h';
export function setTimeFormat(f: '12h' | '24h') {
  timeFormat = f;
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (timeFormat === '24h') return `${pad(h)}:${pad(m)}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${suffix}`;
}

export function shortDate(s: string, ref = todayISO()): string {
  const d = fromISO(s);
  const sameYear = d.getFullYear() === fromISO(ref).getFullYear();
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

export type DueTone = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export function isOverdue(due: Due | null, now = todayISO()): boolean {
  if (!due) return false;
  if (due.date < now) return true;
  return due.date === now && !!due.time && due.time < nowTime();
}

export function dayLabel(s: string, now = todayISO()): string {
  const diff = diffDays(s, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[weekday(s)];
  return shortDate(s, now);
}

export function dueInfo(due: Due, now = todayISO()): { label: string; tone: DueTone } {
  const diff = diffDays(due.date, now);
  let tone: DueTone;
  if (diff < 0) tone = 'overdue';
  else if (diff === 0) tone = 'today';
  else if (diff === 1) tone = 'tomorrow';
  else if (diff < 7) tone = 'week';
  else tone = 'later';
  if (isOverdue(due, now)) tone = 'overdue';
  let label = dayLabel(due.date, now);
  if (due.time) label += ' ' + formatTime(due.time);
  return { label, tone };
}

/** Long header label, e.g. "Oct 30 · Today · Thursday" */
export function dayHeader(s: string, now = todayISO()): string {
  const d = fromISO(s);
  const parts = [`${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`];
  const diff = diffDays(s, now);
  if (diff === 0) parts.push('Today');
  else if (diff === 1) parts.push('Tomorrow');
  parts.push(WEEKDAYS[d.getDay()]);
  return parts.join(' · ');
}

// ---------- Recurrence ----------

export function nextDate(date: string, r: Recurrence): string {
  if (r.workdays) {
    let d = addDays(date, 1);
    while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
    return d;
  }
  if (r.weekdays && r.weekdays.length) {
    let d = addDays(date, 1);
    for (let i = 0; i < 14; i++) {
      if (r.weekdays.includes(weekday(d))) return d;
      d = addDays(d, 1);
    }
    return d;
  }
  switch (r.freq) {
    case 'day':
      return addDays(date, r.interval);
    case 'week':
      return addDays(date, 7 * r.interval);
    case 'month':
      return addMonths(date, r.interval, r.monthDay);
    case 'year':
      return addMonths(date, 12 * r.interval);
  }
}

/** Next due after completing a recurring task: always lands after today. */
export function advanceRecurring(due: Due, now = todayISO()): Due {
  const r = due.recurrence!;
  let d = nextDate(due.date, r);
  let guard = 0;
  while (d <= now && guard++ < 5000) d = nextDate(d, r);
  return { ...due, date: d };
}

/** First date on or after `from` that matches the recurrence. */
export function firstOccurrence(r: Recurrence, from: string): string {
  if (r.workdays) {
    let d = from;
    while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
    return d;
  }
  if (r.weekdays && r.weekdays.length) {
    let d = from;
    for (let i = 0; i < 7; i++) {
      if (r.weekdays.includes(weekday(d))) return d;
      d = addDays(d, 1);
    }
  }
  if (r.monthDay) {
    const f = fromISO(from);
    const dim = daysInMonth(f.getFullYear(), f.getMonth());
    const candidate = toISO(new Date(f.getFullYear(), f.getMonth(), Math.min(r.monthDay, dim)));
    return candidate >= from ? candidate : addMonths(candidate, 1, r.monthDay);
  }
  return from;
}

export function dateFromNow(dateISO: string): string {
  const diff = diffDays(dateISO, todayISO());
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${shortDate(toISO(then))} ${formatTime(`${pad(then.getHours())}:${pad(then.getMinutes())}`)}`;
}

// ---------- durations, deadlines, reminders ----------

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** End time of a timed task, e.g. "5:00 PM – 5:30 PM" → returns "5:30 PM" */
export function endTime(time: string, duration: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + duration) % (24 * 60);
  return formatTime(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
}

export function deadlineInfo(date: string, now = todayISO()): { label: string; tone: 'overdue' | 'soon' | 'later' } {
  const diff = diffDays(date, now);
  return { label: dayLabel(date, now), tone: diff < 0 ? 'overdue' : diff <= 2 ? 'soon' : 'later' };
}

export function reminderLabel(r: Reminder): string {
  if (r.type === 'absolute') {
    const [d, t] = r.at.split('T');
    return `${dayLabel(d)} ${formatTime(t)}`;
  }
  const m = r.minutes;
  if (m === 0) return 'At time of task';
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'} before`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'} before`;
  return `${m} min before`;
}

/** When a reminder should go off (ms epoch), or null if it can't be computed. */
export function reminderTime(r: Reminder, due: Due | null): number | null {
  if (r.type === 'absolute') {
    const [d, t] = r.at.split('T');
    const [h, mi] = t.split(':').map(Number);
    const dt = fromISO(d);
    dt.setHours(h, mi, 0, 0);
    return dt.getTime();
  }
  if (!due) return null;
  const dt = fromISO(due.date);
  const [h, mi] = (due.time ?? '09:00').split(':').map(Number);
  dt.setHours(h, mi, 0, 0);
  return dt.getTime() - r.minutes * 60000;
}
