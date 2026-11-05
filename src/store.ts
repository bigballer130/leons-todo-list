import { useSyncExternalStore } from 'react';
import { addDays, advanceRecurring, todayISO } from './dates';
import type {
  Comment, CompletionLog, Draft, Filter, Label, Project, Section, Settings, State, Task, Template,
  ViewOptions,
} from './types';

const STORAGE_KEY = 'leons-planner:v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const nowIso = () => new Date().toISOString();

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'red',
  weekStart: 1,
  smartDate: true,
  dailyGoal: 5,
  weeklyGoal: 25,
  userName: 'Leon',
  timeFormat: '12h',
  defaultReminder: null,
};

function makeTask(p: Partial<Task> & { content: string; projectId: string }): Task {
  return {
    id: uid(),
    description: '',
    sectionId: null,
    parentId: null,
    order: 0,
    priority: 4,
    labels: [],
    due: null,
    deadline: null,
    duration: null,
    reminders: [],
    completed: false,
    completedAt: null,
    createdAt: nowIso(),
    collapsed: false,
    comments: [],
    ...p,
  };
}

function seed(): State {
  const t = todayISO();
  const inbox: Project = {
    id: 'inbox', name: 'Inbox', color: 'grey', parentId: null, order: 0, favorite: false,
    layout: 'list', isInbox: true, archived: false, collapsed: false,
  };
  const welcome: Project = {
    id: uid(), name: 'Getting Started', color: 'azure', parentId: null, order: 1, favorite: true,
    layout: 'list', archived: false, collapsed: false,
  };
  const home: Project = {
    id: uid(), name: 'Home', color: 'green', parentId: null, order: 2, favorite: false,
    layout: 'list', archived: false, collapsed: false,
  };
  const basics: Section = { id: uid(), projectId: welcome.id, name: 'The basics', order: 0, collapsed: false };
  const power: Section = { id: uid(), projectId: welcome.id, name: 'Power features', order: 1, collapsed: false };

  const parent = makeTask({
    content: 'Try out sub-tasks', projectId: welcome.id, sectionId: basics.id, order: 3,
    description: 'Open this task to add more sub-tasks, or drag a task to the right onto another one.',
  });
  const tasks: Task[] = [
    makeTask({
      content: 'Click the circle to **complete** a task', projectId: welcome.id, sectionId: basics.id, order: 0,
      due: { date: t }, priority: 1,
    }),
    makeTask({
      content: 'Click any task to open its details', projectId: welcome.id, sectionId: basics.id, order: 1,
      description: 'You can add a description, sub-tasks, comments, labels and more.',
    }),
    makeTask({
      content: 'Drag tasks by the handle to reorder them', projectId: welcome.id, sectionId: basics.id, order: 2,
    }),
    parent,
    makeTask({ content: 'This is a sub-task', projectId: welcome.id, sectionId: basics.id, parentId: parent.id, order: 0 }),
    makeTask({ content: 'And another one', projectId: welcome.id, sectionId: basics.id, parentId: parent.id, order: 1 }),
    makeTask({
      content: 'Press Q anywhere to quick-add a task', projectId: welcome.id, sectionId: power.id, order: 0,
      description:
        'Type naturally: "Pay rent every 1st p1 #Home @bills" sets a recurring date, priority, project and label in one go.',
      labels: ['tips'],
    }),
    makeTask({
      content: 'Press Ctrl+K (or /) to search', projectId: welcome.id, sectionId: power.id, order: 1, labels: ['tips'],
    }),
    makeTask({
      content: 'Press ? to see every keyboard shortcut', projectId: welcome.id, sectionId: power.id, order: 2,
      labels: ['tips'],
    }),
    makeTask({
      content: 'Switch this project to Board layout from the View menu', projectId: welcome.id, sectionId: power.id,
      order: 3, due: { date: addDays(t, 1) },
    }),
    makeTask({
      content: 'Create a filter like "today | overdue & p1"', projectId: welcome.id, sectionId: power.id, order: 4,
      due: { date: addDays(t, 3) }, priority: 3,
    }),
    makeTask({
      content: 'Water the plants', projectId: home.id, order: 0, priority: 2,
      due: { date: t, time: '18:00', recurrence: { freq: 'day', interval: 3, text: 'every 3 days' } },
      labels: ['chores'],
    }),
    makeTask({
      content: 'Take out the trash', projectId: home.id, order: 1,
      due: { date: addDays(t, 2), recurrence: { freq: 'week', interval: 1, text: 'every week' } },
      labels: ['chores'],
    }),
    makeTask({ content: 'Plan the weekend', projectId: 'inbox', order: 0, due: { date: addDays(t, 5) } }),
  ];
  return {
    version: 1,
    tasks,
    projects: [inbox, welcome, home],
    sections: [basics, power],
    labels: [
      { id: uid(), name: 'tips', color: 'violet', favorite: false, order: 0 },
      { id: uid(), name: 'chores', color: 'teal', favorite: true, order: 1 },
    ],
    filters: [
      { id: uid(), name: 'Priority 1', query: 'p1', color: 'red', favorite: false, order: 0 },
      { id: uid(), name: 'Next 7 days', query: '7 days | overdue', color: 'azure', favorite: false, order: 1 },
    ],
    log: [],
    templates: [],
    settings: DEFAULT_SETTINGS,
    viewOptions: {},
    sync: { stamps: {}, tombstones: {} },
  };
}

/** Fill in fields added after a state was first saved, so old data keeps working. */
export function migrate(s: State): State {
  const base = seed();
  return {
    ...base,
    ...s,
    tasks: s.tasks.map((t) => ({
      ...t,
      deadline: t.deadline ?? null,
      duration: t.duration ?? null,
      reminders: t.reminders ?? [],
      comments: t.comments ?? [],
    })),
    templates: s.templates ?? [],
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    viewOptions: s.viewOptions ?? {},
    sync: { stamps: s.sync?.stamps ?? {}, tombstones: s.sync?.tombstones ?? {} },
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s && s.version === 1 && Array.isArray(s.tasks)) return migrate(s);
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return seed();
}

let state: State = load();
const listeners = new Set<() => void>();
const undoStack: State[] = [];

const BACKUP_KEY = 'leons-planner:backups';
const MAX_BACKUPS = 7;

export interface Backup {
  at: string;
  data: string;
}

export function listBackups(): Backup[] {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? '[]') as Backup[];
  } catch {
    return [];
  }
}

/** Keep one automatic snapshot per day (the first save of each day), newest first. */
function autoBackup(json: string) {
  const day = new Date().toISOString().slice(0, 10);
  let list = listBackups();
  if (list[0]?.at.slice(0, 10) === day) return;
  list = [{ at: new Date().toISOString(), data: json }, ...list].slice(0, MAX_BACKUPS);
  while (list.length) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
      return;
    } catch {
      list = list.slice(0, -1); // out of space: drop the oldest snapshot and retry
    }
  }
}

function persist() {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, json);
    autoBackup(json);
  } catch {
    /* ignore quota / private mode */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

persist(); // save the (possibly freshly seeded or migrated) state right away

export function getState() {
  return state;
}

export const SYNCED_COLLECTIONS = ['tasks', 'projects', 'sections', 'labels', 'filters', 'log', 'templates'] as const;
export type Collection = (typeof SYNCED_COLLECTIONS)[number];

/**
 * Record when each entity changed (or was deleted) by diffing two states.
 * All updates are immutable, so a changed object reference means a change.
 */
function stamp(prev: State, next: State): State {
  const now = Date.now();
  const stamps = { ...next.sync.stamps };
  const tombstones = { ...next.sync.tombstones };
  let changed = false;
  for (const c of SYNCED_COLLECTIONS) {
    const a = prev[c] as Array<{ id: string }>;
    const b = next[c] as Array<{ id: string }>;
    if (a === b) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const seen = new Set<string>();
    for (const x of b) {
      seen.add(x.id);
      if (before.get(x.id) !== x) {
        stamps[`${c}:${x.id}`] = now;
        delete tombstones[`${c}:${x.id}`];
        changed = true;
      }
    }
    for (const id of before.keys()) {
      if (!seen.has(id)) {
        tombstones[`${c}:${id}`] = now;
        delete stamps[`${c}:${id}`];
        changed = true;
      }
    }
  }
  if (prev.settings !== next.settings) {
    stamps.settings = now;
    changed = true;
  }
  if (prev.viewOptions !== next.viewOptions) {
    for (const k of new Set([...Object.keys(prev.viewOptions), ...Object.keys(next.viewOptions)])) {
      if (prev.viewOptions[k] !== next.viewOptions[k]) {
        stamps[`viewOptions:${k}`] = now;
        changed = true;
      }
    }
  }
  return changed ? { ...next, sync: { stamps, tombstones } } : next;
}

export function setState(fn: (s: State) => State, undoable = false) {
  const prev = state;
  const next = fn(state);
  if (next === prev) return;
  if (undoable) {
    undoStack.push(prev);
    if (undoStack.length > 50) undoStack.shift();
  }
  state = stamp(prev, next);
  persist();
  emit();
}

/** Swap in a state that came from elsewhere (sync) without recording it as a local change. */
export function replaceState(next: State) {
  if (next === state) return;
  state = next;
  undoStack.length = 0; // undoing across a merge would discard the other device's changes
  persist();
  emit();
}

export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev) return false;
  // keep the current change history, and record the reverted entities as fresh changes
  state = stamp(state, { ...prev, sync: state.sync });
  persist();
  emit();
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        state = migrate(JSON.parse(e.newValue));
        emit();
      } catch {
        /* ignore */
      }
    }
  });
}

export function useAppState(): State {
  return useSyncExternalStore(subscribe, getState);
}

export { subscribe as subscribeState };

// ---------- helpers ----------

export function descendantIds(tasks: Task[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const t of tasks) if (t.parentId === pid) {
      out.push(t.id);
      walk(t.id);
    }
  };
  walk(id);
  return out;
}

export function projectDescendants(projects: Project[], id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const p of projects) if (p.parentId === pid) {
      out.push(p.id);
      walk(p.id);
    }
  };
  walk(id);
  return out;
}

function mapTasks(s: State, ids: Set<string>, fn: (t: Task) => Task): State {
  return { ...s, tasks: s.tasks.map((t) => (ids.has(t.id) ? fn(t) : t)) };
}

function nextOrder<T extends { order: number }>(items: T[]) {
  return items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
}

// ---------- task actions ----------

export function addTask(d: Draft, position?: { before?: string; after?: string }): Task {
  const s = getState();
  const siblings = s.tasks.filter(
    (t) => t.projectId === d.projectId && t.sectionId === d.sectionId && t.parentId === d.parentId,
  );
  const task = makeTask({ ...d, order: nextOrder(siblings) });
  const labelsToCreate = d.labels.filter((n) => !s.labels.some((l) => l.name.toLowerCase() === n.toLowerCase()));
  setState((st) => {
    let tasks = [...st.tasks, task];
    const ref = position?.before ?? position?.after;
    if (ref) {
      const sorted = siblings.filter((t) => t.id !== task.id).sort((a, b) => a.order - b.order);
      let idx = sorted.findIndex((t) => t.id === ref);
      if (idx >= 0 && position?.after) idx += 1;
      if (idx < 0) idx = sorted.length;
      sorted.splice(idx, 0, task);
      const orders = new Map(sorted.map((t, i) => [t.id, i]));
      tasks = tasks.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id)! } : t));
    }
    return {
      ...st,
      tasks,
      labels: [
        ...st.labels,
        ...labelsToCreate.map((name, i) => ({
          id: uid(), name, color: 'grey', favorite: false, order: st.labels.length + i,
        })),
      ],
    };
  }, true);
  return task;
}

export function updateTask(id: string, patch: Partial<Task>) {
  const s = getState();
  const labelsToCreate = (patch.labels ?? []).filter(
    (n) => !s.labels.some((l) => l.name.toLowerCase() === n.toLowerCase()),
  );
  setState((st) => {
    const old = st.tasks.find((t) => t.id === id);
    if (!old) return st;
    let next = mapTasks(st, new Set([id]), (t) => ({ ...t, ...patch }));
    // moving to another project / section carries sub-tasks along
    if ((patch.projectId && patch.projectId !== old.projectId) || (patch.sectionId !== undefined && patch.sectionId !== old.sectionId)) {
      const desc = new Set(descendantIds(st.tasks, id));
      next = mapTasks(next, desc, (t) => ({
        ...t, projectId: patch.projectId ?? t.projectId, sectionId: patch.sectionId !== undefined ? patch.sectionId : t.sectionId,
      }));
      if (patch.parentId === undefined && old.parentId) {
        const parent = st.tasks.find((t) => t.id === old.parentId);
        if (parent && (parent.projectId !== (patch.projectId ?? old.projectId) || parent.sectionId !== (patch.sectionId !== undefined ? patch.sectionId : old.sectionId))) {
          next = mapTasks(next, new Set([id]), (t) => ({ ...t, parentId: null }));
        }
      }
    }
    if (labelsToCreate.length) {
      next = {
        ...next,
        labels: [
          ...next.labels,
          ...labelsToCreate.map((name, i) => ({ id: uid(), name, color: 'grey', favorite: false, order: next.labels.length + i })),
        ],
      };
    }
    return next;
  }, true);
}

export function updateTasks(ids: string[], patch: Partial<Task>) {
  const set = new Set(ids);
  setState((s) => mapTasks(s, set, (t) => ({ ...t, ...patch })), true);
}

/** Returns true if the task was recurring (and was rescheduled instead of closed). */
export function completeTask(id: string): 'completed' | 'rescheduled' {
  const s = getState();
  const task = s.tasks.find((t) => t.id === id);
  if (!task) return 'completed';
  const entry: CompletionLog = {
    id: uid(), taskId: id, content: task.content, projectId: task.projectId, completedAt: nowIso(),
  };
  if (task.due?.recurrence) {
    setState((st) => ({
      ...mapTasks(st, new Set([id]), (t) => ({ ...t, due: advanceRecurring(t.due!, todayISO()) })),
      log: [entry, ...st.log],
    }), true);
    return 'rescheduled';
  }
  const ids = new Set([id, ...descendantIds(s.tasks, id)]);
  const at = nowIso();
  setState((st) => ({
    ...mapTasks(st, ids, (t) => (t.completed ? t : { ...t, completed: true, completedAt: at })),
    log: [entry, ...st.log],
  }), true);
  return 'completed';
}

export function uncompleteTask(id: string) {
  setState((s) => {
    const task = s.tasks.find((t) => t.id === id);
    if (!task) return s;
    // re-opening a sub-task re-opens its parents too
    const ids = new Set([id]);
    let p = task.parentId;
    while (p) {
      ids.add(p);
      p = s.tasks.find((t) => t.id === p)?.parentId ?? null;
    }
    const idx = s.log.findIndex((l) => l.taskId === id);
    return {
      ...mapTasks(s, ids, (t) => ({ ...t, completed: false, completedAt: null })),
      log: idx >= 0 ? s.log.filter((_, i) => i !== idx) : s.log,
    };
  }, true);
}

export function deleteTask(id: string) {
  setState((s) => {
    const ids = new Set([id, ...descendantIds(s.tasks, id)]);
    return { ...s, tasks: s.tasks.filter((t) => !ids.has(t.id)) };
  }, true);
}

export function duplicateTask(id: string) {
  setState((s) => {
    const src = s.tasks.find((t) => t.id === id);
    if (!src) return s;
    const idMap = new Map<string, string>();
    const all = [id, ...descendantIds(s.tasks, id)];
    all.forEach((tid) => idMap.set(tid, uid()));
    const copies = all.map((tid) => {
      const t = s.tasks.find((x) => x.id === tid)!;
      return {
        ...t,
        id: idMap.get(tid)!,
        parentId: tid === id ? t.parentId : idMap.get(t.parentId!)!,
        order: tid === id ? t.order + 0.5 : t.order,
        createdAt: nowIso(),
        comments: [],
      };
    });
    return { ...s, tasks: [...s.tasks, ...copies] };
  }, true);
}

/**
 * Move a task relative to another one in a list.
 * mode 'before' / 'after' → becomes a sibling; 'child' → becomes the last sub-task of target.
 */
export function moveTask(id: string, targetId: string, mode: 'before' | 'after' | 'child') {
  setState((s) => {
    if (id === targetId) return s;
    const task = s.tasks.find((t) => t.id === id);
    const target = s.tasks.find((t) => t.id === targetId);
    if (!task || !target) return s;
    if (descendantIds(s.tasks, id).includes(targetId)) return s; // can't drop into own subtree
    const parentId = mode === 'child' ? target.id : target.parentId;
    const { projectId, sectionId } = target;
    const siblings = s.tasks
      .filter((t) => t.id !== id && t.parentId === parentId && t.projectId === projectId && t.sectionId === sectionId)
      .sort((a, b) => a.order - b.order);
    let idx = mode === 'child' ? siblings.length : siblings.findIndex((t) => t.id === targetId) + (mode === 'after' ? 1 : 0);
    if (idx < 0) idx = siblings.length;
    siblings.splice(idx, 0, task);
    const orders = new Map(siblings.map((t, i) => [t.id, i]));
    const desc = new Set(descendantIds(s.tasks, id));
    return {
      ...s,
      tasks: s.tasks.map((t) => {
        if (t.id === id) return { ...t, parentId, projectId, sectionId, order: orders.get(t.id)! };
        if (desc.has(t.id)) return { ...t, projectId, sectionId };
        if (orders.has(t.id)) return { ...t, order: orders.get(t.id)! };
        return t;
      }),
      ...(mode === 'child' ? {} : {}),
    };
  }, true);
}

/** Move a task to the end of a section (or project root when sectionId is null). */
export function moveTaskToSection(id: string, projectId: string, sectionId: string | null) {
  setState((s) => {
    const siblings = s.tasks.filter((t) => t.projectId === projectId && t.sectionId === sectionId && !t.parentId && t.id !== id);
    const desc = new Set(descendantIds(s.tasks, id));
    return {
      ...s,
      tasks: s.tasks.map((t) => {
        if (t.id === id) return { ...t, projectId, sectionId, parentId: null, order: nextOrder(siblings) };
        if (desc.has(t.id)) return { ...t, projectId, sectionId };
        return t;
      }),
    };
  }, true);
}

export function indentTask(id: string) {
  const s = getState();
  const t = s.tasks.find((x) => x.id === id);
  if (!t) return;
  const prev = s.tasks
    .filter((x) => x.parentId === t.parentId && x.projectId === t.projectId && x.sectionId === t.sectionId && x.order < t.order && !x.completed)
    .sort((a, b) => b.order - a.order)[0];
  if (prev) moveTask(id, prev.id, 'child');
}

export function outdentTask(id: string) {
  const s = getState();
  const t = s.tasks.find((x) => x.id === id);
  if (!t?.parentId) return;
  moveTask(id, t.parentId, 'after');
}

export function addComment(taskId: string, text: string) {
  const c: Comment = { id: uid(), text, createdAt: nowIso() };
  setState((s) => mapTasks(s, new Set([taskId]), (t) => ({ ...t, comments: [...t.comments, c] })), true);
}

export function deleteComment(taskId: string, commentId: string) {
  setState((s) => mapTasks(s, new Set([taskId]), (t) => ({ ...t, comments: t.comments.filter((c) => c.id !== commentId) })), true);
}

export function clearCompletedLog() {
  setState((s) => ({ ...s, log: [] }), true);
}

// ---------- projects ----------

export function addProject(p: Partial<Project> & { name: string }): Project {
  const s = getState();
  const project: Project = {
    id: uid(), color: 'grey', parentId: null, favorite: false, layout: 'list', archived: false, collapsed: false,
    order: nextOrder(s.projects), ...p,
  };
  setState((st) => ({ ...st, projects: [...st.projects, project] }), true);
  return project;
}

export function updateProject(id: string, patch: Partial<Project>) {
  setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), true);
}

export function deleteProject(id: string) {
  setState((s) => {
    const ids = new Set([id, ...projectDescendants(s.projects, id)]);
    return {
      ...s,
      projects: s.projects.filter((p) => !ids.has(p.id)),
      sections: s.sections.filter((x) => !ids.has(x.projectId)),
      tasks: s.tasks.filter((t) => !ids.has(t.projectId)),
    };
  }, true);
}

export function reorderProject(id: string, targetId: string, mode: 'before' | 'after' | 'child') {
  setState((s) => {
    if (id === targetId || projectDescendants(s.projects, id).includes(targetId)) return s;
    const target = s.projects.find((p) => p.id === targetId);
    if (!target || target.isInbox) return s;
    const parentId = mode === 'child' ? target.id : target.parentId;
    const siblings = s.projects
      .filter((p) => p.id !== id && p.parentId === parentId && !p.isInbox)
      .sort((a, b) => a.order - b.order);
    let idx = mode === 'child' ? siblings.length : siblings.findIndex((p) => p.id === targetId) + (mode === 'after' ? 1 : 0);
    if (idx < 0) idx = siblings.length;
    siblings.splice(idx, 0, s.projects.find((p) => p.id === id)!);
    const orders = new Map(siblings.map((p, i) => [p.id, i + 1]));
    return {
      ...s,
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, parentId, order: orders.get(p.id)! } : orders.has(p.id) ? { ...p, order: orders.get(p.id)! } : p,
      ),
    };
  }, true);
}

// ---------- sections ----------

export function addSection(projectId: string, name: string, afterSectionId?: string | null): Section {
  const s = getState();
  const siblings = s.sections.filter((x) => x.projectId === projectId).sort((a, b) => a.order - b.order);
  const sec: Section = { id: uid(), projectId, name, order: nextOrder(siblings), collapsed: false };
  setState((st) => {
    if (afterSectionId === undefined) return { ...st, sections: [...st.sections, sec] };
    const list = [...siblings];
    const idx = afterSectionId === null ? 0 : list.findIndex((x) => x.id === afterSectionId) + 1;
    list.splice(idx, 0, sec);
    const orders = new Map(list.map((x, i) => [x.id, i]));
    return {
      ...st,
      sections: [...st.sections, sec].map((x) => (orders.has(x.id) ? { ...x, order: orders.get(x.id)! } : x)),
    };
  }, true);
  return sec;
}

export function updateSection(id: string, patch: Partial<Section>) {
  setState((s) => ({ ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) }), true);
}

export function deleteSection(id: string) {
  setState((s) => ({ ...s, sections: s.sections.filter((x) => x.id !== id), tasks: s.tasks.filter((t) => t.sectionId !== id) }), true);
}

export function moveSection(id: string, targetId: string, mode: 'before' | 'after') {
  setState((s) => {
    const sec = s.sections.find((x) => x.id === id);
    const target = s.sections.find((x) => x.id === targetId);
    if (!sec || !target || id === targetId) return s;
    const list = s.sections.filter((x) => x.projectId === target.projectId && x.id !== id).sort((a, b) => a.order - b.order);
    list.splice(list.findIndex((x) => x.id === targetId) + (mode === 'after' ? 1 : 0), 0, sec);
    const orders = new Map(list.map((x, i) => [x.id, i]));
    return { ...s, sections: s.sections.map((x) => (orders.has(x.id) ? { ...x, order: orders.get(x.id)!, projectId: target.projectId } : x)) };
  }, true);
}

// ---------- labels & filters ----------

export function addLabel(l: Partial<Label> & { name: string }): Label {
  const label: Label = { id: uid(), color: 'grey', favorite: false, order: nextOrder(getState().labels), ...l };
  setState((s) => ({ ...s, labels: [...s.labels, label] }), true);
  return label;
}

export function updateLabel(id: string, patch: Partial<Label>) {
  setState((s) => {
    const old = s.labels.find((l) => l.id === id);
    if (!old) return s;
    const renamed = patch.name && patch.name !== old.name;
    return {
      ...s,
      labels: s.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      tasks: renamed ? s.tasks.map((t) => ({ ...t, labels: t.labels.map((n) => (n === old.name ? patch.name! : n)) })) : s.tasks,
    };
  }, true);
}

export function deleteLabel(id: string) {
  setState((s) => {
    const old = s.labels.find((l) => l.id === id);
    if (!old) return s;
    return {
      ...s,
      labels: s.labels.filter((l) => l.id !== id),
      tasks: s.tasks.map((t) => (t.labels.includes(old.name) ? { ...t, labels: t.labels.filter((n) => n !== old.name) } : t)),
    };
  }, true);
}

export function addFilter(f: Partial<Filter> & { name: string; query: string }): Filter {
  const filter: Filter = { id: uid(), color: 'grey', favorite: false, order: nextOrder(getState().filters), ...f };
  setState((s) => ({ ...s, filters: [...s.filters, filter] }), true);
  return filter;
}

export function updateFilter(id: string, patch: Partial<Filter>) {
  setState((s) => ({ ...s, filters: s.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)) }), true);
}

export function deleteFilter(id: string) {
  setState((s) => ({ ...s, filters: s.filters.filter((f) => f.id !== id) }), true);
}

// ---------- settings ----------

export function updateSettings(patch: Partial<Settings>) {
  if (Object.entries(patch).every(([k, v]) => getState().settings[k as keyof Settings] === v)) return;
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = { sort: 'manual', showCompleted: false };

export function setViewOptions(key: string, patch: Partial<ViewOptions>) {
  setState((s) => ({
    ...s,
    viewOptions: { ...s.viewOptions, [key]: { ...DEFAULT_VIEW_OPTIONS, ...s.viewOptions[key], ...patch } },
  }));
}

export function exportData(): string {
  return JSON.stringify(getState(), null, 2);
}

export function importData(json: string) {
  const data = JSON.parse(json) as State;
  if (!data || data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.projects)) {
    throw new Error('This file does not look like a planner backup.');
  }
  if (!data.projects.some((p) => p.isInbox)) throw new Error('Backup is missing an Inbox project.');
  const incoming = migrate(data);
  setState((s) => ({ ...incoming, sync: s.sync }), true);
}

export function resetData(empty: boolean) {
  setState((s) => {
    const fresh = { ...seed(), sync: s.sync };
    if (!empty) return fresh;
    return { ...fresh, tasks: [], projects: fresh.projects.filter((p) => p.isInbox), sections: [], labels: [], filters: [] };
  }, true);
}

export function restoreBackup(b: Backup) {
  const data = migrate(JSON.parse(b.data) as State);
  setState((s) => ({ ...data, sync: s.sync }), true);
}

// ---------- templates ----------

export function projectToTemplate(projectId: string, name: string): Template {
  const s = getState();
  const project = s.projects.find((p) => p.id === projectId)!;
  const sections = s.sections.filter((x) => x.projectId === projectId).sort((a, b) => a.order - b.order);
  // parents before children, in display order
  const ordered: Task[] = [];
  const walk = (parentId: string | null, sectionId: string | null) => {
    s.tasks
      .filter((t) => t.projectId === projectId && !t.completed && t.parentId === parentId && (parentId || t.sectionId === sectionId))
      .sort((a, b) => a.order - b.order)
      .forEach((t) => {
        ordered.push(t);
        walk(t.id, t.sectionId);
      });
  };
  walk(null, null);
  sections.forEach((x) => walk(null, x.id));
  const today = todayISO();
  return {
    id: uid(),
    name,
    color: project.color,
    layout: project.layout,
    sections: sections.map((x) => x.name),
    tasks: ordered.map((t) => ({
      content: t.content,
      description: t.description,
      priority: t.priority,
      labels: t.labels,
      section: t.sectionId ? sections.findIndex((x) => x.id === t.sectionId) : null,
      parent: t.parentId ? ordered.findIndex((x) => x.id === t.parentId) : null,
      dueOffset: t.due ? Math.max(0, Math.round((new Date(t.due.date).getTime() - new Date(today).getTime()) / 86400000)) : null,
      time: t.due?.time ?? null,
      recurrence: t.due?.recurrence ?? null,
    })),
    createdAt: nowIso(),
  };
}

export function saveTemplate(t: Template) {
  setState((s) => ({ ...s, templates: [...s.templates, t] }), true);
}

export function deleteTemplate(id: string) {
  setState((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }), true);
}

export function createFromTemplate(tpl: Template, name: string, parentId: string | null = null): Project {
  const s = getState();
  const project: Project = {
    id: uid(), name, color: tpl.color, parentId, favorite: false, layout: tpl.layout, archived: false, collapsed: false,
    order: nextOrder(s.projects),
  };
  const sections: Section[] = tpl.sections.map((n, i) => ({ id: uid(), projectId: project.id, name: n, order: i, collapsed: false }));
  const ids = tpl.tasks.map(() => uid());
  const today = todayISO();
  const tasks: Task[] = tpl.tasks.map((t, i) => {
    return makeTask({
      id: ids[i],
      content: t.content,
      description: t.description,
      priority: t.priority,
      labels: t.labels,
      projectId: project.id,
      sectionId: t.section !== null ? sections[t.section]?.id ?? null : null,
      parentId: t.parent !== null ? ids[t.parent] : null,
      order: i,
      due: t.dueOffset !== null ? { date: addDays(today, t.dueOffset), time: t.time, recurrence: t.recurrence } : null,
    });
  });
  const missingLabels = [...new Set(tasks.flatMap((t) => t.labels))].filter(
    (n) => !s.labels.some((l) => l.name.toLowerCase() === n.toLowerCase()),
  );
  setState((st) => ({
    ...st,
    projects: [...st.projects, project],
    sections: [...st.sections, ...sections],
    tasks: [...st.tasks, ...tasks],
    labels: [
      ...st.labels,
      ...missingLabels.map((n, i) => ({ id: uid(), name: n, color: 'grey', favorite: false, order: st.labels.length + i })),
    ],
  }), true);
  return project;
}
