export type Priority = 1 | 2 | 3 | 4;

export type Freq = 'day' | 'week' | 'month' | 'year';

export interface Recurrence {
  freq: Freq;
  interval: number;
  /** 0 = Sunday … 6 = Saturday */
  weekdays?: number[];
  workdays?: boolean;
  monthDay?: number;
  /** Human readable, e.g. "every mon, fri" */
  text: string;
}

export interface Due {
  /** YYYY-MM-DD in local time */
  date: string;
  /** HH:mm, 24h */
  time?: string | null;
  recurrence?: Recurrence | null;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  content: string;
  description: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  order: number;
  priority: Priority;
  /** label names */
  labels: string[];
  due: Due | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  collapsed: boolean;
  comments: Comment[];
}

export type Layout = 'list' | 'board';

export interface Project {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  order: number;
  favorite: boolean;
  layout: Layout;
  isInbox?: boolean;
  archived: boolean;
  collapsed: boolean;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  order: number;
  collapsed: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  favorite: boolean;
  order: number;
}

export interface Filter {
  id: string;
  name: string;
  query: string;
  color: string;
  favorite: boolean;
  order: number;
}

export interface CompletionLog {
  id: string;
  taskId: string;
  content: string;
  projectId: string;
  completedAt: string;
}

export type SortBy = 'manual' | 'date' | 'priority' | 'name' | 'added';

export interface ViewOptions {
  sort: SortBy;
  showCompleted: boolean;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  accent: string;
  /** 0 = Sunday, 1 = Monday */
  weekStart: 0 | 1;
  smartDate: boolean;
  dailyGoal: number;
  weeklyGoal: number;
  userName: string;
  timeFormat: '12h' | '24h';
}

export interface State {
  version: 1;
  tasks: Task[];
  projects: Project[];
  sections: Section[];
  labels: Label[];
  filters: Filter[];
  log: CompletionLog[];
  settings: Settings;
  viewOptions: Record<string, ViewOptions>;
}

export type View =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'project'; id: string }
  | { kind: 'label'; id: string }
  | { kind: 'filter'; id: string }
  | { kind: 'filters-labels' }
  | { kind: 'completed' }
  | { kind: 'search'; q: string };

/** What a new task should default to when added from a given place. */
export interface TaskDefaults {
  projectId?: string;
  sectionId?: string | null;
  parentId?: string | null;
  due?: Due | null;
  labels?: string[];
  priority?: Priority;
}

export interface Draft {
  content: string;
  description: string;
  due: Due | null;
  priority: Priority;
  labels: string[];
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
}
