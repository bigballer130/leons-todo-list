import { pad, toISO } from './dates';
import { scanDates, stripTokens } from './parser';
import { getState, setState } from './store';
import type { Comment, CompletionLog, Due, Filter, Label, Layout, Priority, Project, Reminder, Section, State, Task } from './types';

/*
 * One-off import from a Todoist account, run in the browser with the user's API token.
 * Imported entities get ids derived from their Todoist ids ("td-…"), so running the
 * import again updates what was imported before instead of duplicating it.
 */

const API = 'https://api.todoist.com/api/v1';

// ---- the parts of Todoist's API responses we use ----
interface TdDue { date: string; string?: string; is_recurring?: boolean; timezone?: string | null }
interface TdProject { id: string; name: string; color?: string; parent_id?: string | null; child_order?: number; is_favorite?: boolean; is_archived?: boolean; is_deleted?: boolean; view_style?: string; inbox_project?: boolean; is_collapsed?: boolean }
interface TdSection { id: string; project_id: string; name: string; section_order?: number; is_collapsed?: boolean; is_archived?: boolean; is_deleted?: boolean }
interface TdItem { id: string; content: string; description?: string; project_id: string; section_id?: string | null; parent_id?: string | null; child_order?: number; priority?: number; labels?: string[]; due?: TdDue | null; deadline?: { date: string } | null; duration?: { amount: number; unit: string } | null; checked?: boolean; is_deleted?: boolean; added_at?: string; completed_at?: string | null; collapsed?: boolean }
interface TdLabel { id: string; name: string; color?: string; item_order?: number; is_favorite?: boolean; is_deleted?: boolean }
interface TdFilter { id: string; name: string; query: string; color?: string; item_order?: number; is_favorite?: boolean; is_deleted?: boolean }
interface TdReminder { id: string; item_id: string; type?: string; due?: TdDue | null; minute_offset?: number; is_deleted?: boolean }
interface TdNote { id: string; item_id: string; content?: string; posted_at?: string; is_deleted?: boolean; file_attachment?: { file_name?: string; file_url?: string } | null }
interface TdSync { projects?: TdProject[]; sections?: TdSection[]; items?: TdItem[]; labels?: TdLabel[]; filters?: TdFilter[]; reminders?: TdReminder[]; notes?: TdNote[]; project_notes?: unknown[] }
interface TdCompleted { id?: string; task_id?: string; content: string; project_id: string; completed_at: string }

export interface TodoistData {
  sync: TdSync;
  completed: TdCompleted[];
}

export interface ImportSummary {
  projects: number;
  sections: number;
  tasks: number;
  labels: number;
  filters: number;
  reminders: number;
  comments: number;
  completed: number;
  /** things that couldn't be carried over, in plain words */
  notes: string[];
}

// ---------------- fetching ----------------

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  } catch {
    throw new Error('Could not reach Todoist. Check your connection and try again.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('Todoist did not accept that token. Copy it again from Todoist → Settings → Integrations → Developer.');
  if (res.status === 429) throw new Error('Todoist is rate-limiting requests. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Todoist returned an error (${res.status}). Try again in a moment.`);
  return res.json() as Promise<T>;
}

export async function fetchTodoist(token: string): Promise<TodoistData> {
  token = token.trim();
  const body = new URLSearchParams({ sync_token: '*', resource_types: JSON.stringify(['all']) });
  const sync = await call<TdSync>(token, '/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  // Completed history (best effort: the API serves it in windows of up to ~3 months)
  const completed: TdCompleted[] = [];
  try {
    const until = new Date();
    for (let w = 0; w < 4; w++) {
      const since = new Date(until.getTime() - 89 * 86400000);
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const q = new URLSearchParams({ since: since.toISOString(), until: until.toISOString(), limit: '200' });
        if (cursor) q.set('cursor', cursor);
        const r: { items?: TdCompleted[]; next_cursor?: string | null } = await call(token, `/tasks/completed/by_completion_date?${q}`);
        completed.push(...(r.items ?? []));
        cursor = r.next_cursor ?? null;
        if (!cursor) break;
      }
      until.setTime(since.getTime());
    }
  } catch {
    /* history is optional; active data is what matters */
  }
  const seen = new Set<string>();
  const unique = completed.filter((c) => {
    const k = `${c.id ?? c.task_id}|${c.completed_at}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { sync, completed: unique };
}

// ---------------- converting ----------------

const COLOR_MAP: Record<string, string> = {
  berry_red: 'crimson', red: 'red', orange: 'orange', yellow: 'amber', olive_green: 'olive', lime_green: 'lime',
  green: 'green', mint_green: 'mint', teal: 'teal', sky_blue: 'sky', light_blue: 'azure', blue: 'blue', grape: 'violet',
  violet: 'indigo', lavender: 'plum', magenta: 'pink', salmon: 'coral', charcoal: 'slate', grey: 'grey', taupe: 'sand',
};
const color = (c?: string) => COLOR_MAP[c ?? ''] ?? 'grey';
const tid = (id: string) => `td-${id}`;

/** Todoist due/reminder date → local date and HH:mm (UTC "Z" times converted to local). */
function splitDate(d: string): { date: string; time: string | null } {
  if (d.length <= 10) return { date: d, time: null };
  if (/Z$|[+-]\d\d:\d\d$/.test(d)) {
    const dt = new Date(d);
    return { date: toISO(dt), time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
  }
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

function convertDue(due: TdDue | null | undefined, notes: Set<string>): Due | null {
  if (!due?.date) return null;
  const { date, time } = splitDate(due.date);
  let recurrence = null;
  if (due.is_recurring && due.string) {
    // only accept a repeat rule the app understood completely (e.g. not "every 3rd friday")
    const scan = scanDates(due.string);
    const fully = stripTokens(due.string, scan.tokens) === '' && !scan.parsed.date;
    recurrence = fully ? scan.parsed.recurrence ?? null : null;
    if (!recurrence) notes.add(`Some repeating schedules weren’t understood (e.g. “${due.string}”); those tasks keep their next date but don’t repeat.`);
  }
  return { date, time, recurrence };
}

export function summarize(data: TodoistData): ImportSummary {
  const live = <T extends { is_deleted?: boolean }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !x.is_deleted);
  const s = data.sync;
  const items = live(s.items).filter((i) => !i.checked);
  const ids = new Set(items.map((i) => i.id));
  return {
    projects: live(s.projects).filter((p) => !p.inbox_project).length,
    sections: live(s.sections).length,
    tasks: items.length,
    labels: live(s.labels).length,
    filters: live(s.filters).length,
    reminders: live(s.reminders).filter((r) => ids.has(r.item_id)).length,
    comments: live(s.notes).filter((n) => ids.has(n.item_id)).length,
    completed: data.completed.length,
    notes: [],
  };
}

export function applyTodoistImport(data: TodoistData): ImportSummary {
  const s = data.sync;
  const notes = new Set<string>();
  const live = <T extends { is_deleted?: boolean }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !x.is_deleted);
  const now = new Date().toISOString();
  const state = getState();
  const inbox = state.projects.find((p) => p.isInbox)!;

  // projects (Todoist's Inbox maps onto ours)
  const tdProjects = live(s.projects);
  const tdInbox = tdProjects.find((p) => p.inbox_project);
  const projectId = (id: string | null | undefined) => (!id ? null : id === tdInbox?.id ? inbox.id : tid(id));
  const baseOrder = state.projects.filter((p) => !p.id.startsWith('td-')).reduce((m, p) => Math.max(m, p.order), 0) + 1;
  const projects: Project[] = tdProjects
    .filter((p) => !p.inbox_project)
    .map((p) => ({
      id: tid(p.id),
      name: p.name,
      color: color(p.color),
      parentId: p.parent_id && p.parent_id !== tdInbox?.id ? tid(p.parent_id) : null,
      order: baseOrder + (p.child_order ?? 0),
      favorite: !!p.is_favorite,
      layout: (['list', 'board', 'calendar'].includes(p.view_style ?? '') ? p.view_style : 'list') as Layout,
      archived: !!p.is_archived,
      collapsed: !!p.is_collapsed,
    }));
  const knownProjects = new Set([inbox.id, ...projects.map((p) => p.id)]);

  const sections: Section[] = live(s.sections)
    .filter((x) => !x.is_archived && knownProjects.has(projectId(x.project_id)!))
    .map((x) => ({ id: tid(x.id), projectId: projectId(x.project_id)!, name: x.name, order: x.section_order ?? 0, collapsed: !!x.is_collapsed }));
  const knownSections = new Set(sections.map((x) => x.id));

  // reminders and comments grouped by task
  const reminders = new Map<string, Reminder[]>();
  for (const r of live(s.reminders)) {
    let rem: Reminder | null = null;
    if (r.type === 'relative' && typeof r.minute_offset === 'number') rem = { id: tid(r.id), type: 'relative', minutes: r.minute_offset };
    else if (r.type === 'absolute' && r.due?.date) {
      const { date, time } = splitDate(r.due.date);
      rem = { id: tid(r.id), type: 'absolute', at: `${date}T${time ?? '09:00'}` };
    } else if (r.type === 'location') notes.add('Location-based reminders can’t be imported (the app has no location reminders).');
    if (rem) reminders.set(r.item_id, [...(reminders.get(r.item_id) ?? []), rem]);
  }
  const comments = new Map<string, Comment[]>();
  for (const n of live(s.notes)) {
    let text = n.content ?? '';
    if (n.file_attachment?.file_url) {
      text = `${text}${text ? '\n' : ''}📎 [${n.file_attachment.file_name ?? 'Attachment'}](${n.file_attachment.file_url})`;
      notes.add('File attachments were brought over as links to the files stored in Todoist.');
    }
    if (!text.trim()) continue;
    comments.set(n.item_id, [...(comments.get(n.item_id) ?? []), { id: tid(n.id), text, createdAt: n.posted_at ?? now }]);
  }
  if ((s.project_notes ?? []).length) notes.add('Comments on whole projects were skipped (the app only has comments on tasks).');

  const items = live(s.items).filter((i) => !i.checked && knownProjects.has(projectId(i.project_id)!));
  const itemIds = new Set(items.map((i) => i.id));
  const tasks: Task[] = items.map((i) => ({
    id: tid(i.id),
    content: i.content,
    description: i.description ?? '',
    projectId: projectId(i.project_id)!,
    sectionId: i.section_id && knownSections.has(tid(i.section_id)) ? tid(i.section_id) : null,
    parentId: i.parent_id && itemIds.has(i.parent_id) ? tid(i.parent_id) : null,
    order: i.child_order ?? 0,
    priority: (5 - Math.min(4, Math.max(1, i.priority ?? 1))) as Priority,
    labels: i.labels ?? [],
    due: convertDue(i.due, notes),
    deadline: i.deadline?.date ?? null,
    duration: i.duration?.amount ? Math.min(1440, i.duration.unit === 'day' ? i.duration.amount * 1440 : i.duration.amount) : null,
    reminders: reminders.get(i.id) ?? [],
    completed: false,
    completedAt: null,
    createdAt: i.added_at ?? now,
    collapsed: !!i.collapsed,
    comments: comments.get(i.id) ?? [],
  }));

  // labels: reuse ones that already exist by name; also cover names only used on tasks
  const existingLabel = (n: string) => state.labels.find((l) => l.name.toLowerCase() === n.toLowerCase());
  const labels: Label[] = [];
  for (const l of live(s.labels)) {
    if (existingLabel(l.name)) continue;
    labels.push({ id: tid(l.id), name: l.name, color: color(l.color), favorite: !!l.is_favorite, order: state.labels.length + (l.item_order ?? 0) });
  }
  for (const n of new Set(tasks.flatMap((t) => t.labels))) {
    if (!existingLabel(n) && !labels.some((l) => l.name === n)) {
      labels.push({ id: `td-label-${n}`, name: n, color: 'grey', favorite: false, order: state.labels.length + labels.length });
    }
  }

  const filters: Filter[] = live(s.filters).map((f) => ({
    id: tid(f.id), name: f.name, query: f.query, color: color(f.color), favorite: !!f.is_favorite, order: state.filters.length + (f.item_order ?? 0),
  }));

  const log: CompletionLog[] = data.completed.map((c) => ({
    id: `td-done-${c.id ?? c.task_id}-${c.completed_at}`,
    taskId: tid(c.task_id ?? c.id ?? ''),
    content: c.content,
    projectId: projectId(c.project_id) ?? inbox.id,
    completedAt: c.completed_at,
  }));

  const upsert = <T extends { id: string }>(current: T[], incoming: T[]) => {
    const byId = new Map(incoming.map((x) => [x.id, x]));
    const kept = current.map((x) => byId.get(x.id) ?? x);
    const have = new Set(current.map((x) => x.id));
    return [...kept, ...incoming.filter((x) => !have.has(x.id))];
  };

  setState((st: State) => ({
    ...st,
    projects: upsert(st.projects, projects),
    sections: upsert(st.sections, sections),
    tasks: upsert(st.tasks, tasks),
    labels: upsert(st.labels, labels),
    filters: upsert(st.filters, filters),
    log: [...upsert(st.log, log)].sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  }), true);

  return {
    projects: projects.length,
    sections: sections.length,
    tasks: tasks.length,
    labels: labels.length,
    filters: filters.length,
    reminders: tasks.reduce((n, t) => n + t.reminders.length, 0),
    comments: tasks.reduce((n, t) => n + t.comments.length, 0),
    completed: log.length,
    notes: [...notes],
  };
}
