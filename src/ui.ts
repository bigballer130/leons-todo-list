import { useMemo, useSyncExternalStore } from 'react';
import type { TaskDefaults, View } from './types';
import { canUndo, undo } from './store';

export type Dialog =
  | { kind: 'project'; id?: string; parentId?: string | null }
  | { kind: 'label'; id?: string }
  | { kind: 'filter'; id?: string; query?: string }
  | { kind: 'settings' }
  | { kind: 'shortcuts' }
  | { kind: 'productivity' }
  | { kind: 'confirm'; title: string; message: string; confirmLabel?: string; onConfirm: () => void };

export interface Toast {
  id: number;
  message: string;
  undo?: boolean;
}

export interface UIState {
  detailTaskId: string | null;
  quickAdd: TaskDefaults | null;
  search: boolean;
  dialog: Dialog | null;
  toasts: Toast[];
  sidebarOpen: boolean;
  editingTaskId: string | null;
}

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

let ui: UIState = {
  detailTaskId: null,
  quickAdd: null,
  search: false,
  dialog: null,
  toasts: [],
  sidebarOpen: !isMobile(),
  editingTaskId: null,
};
const listeners = new Set<() => void>();

export function setUI(patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) {
  const p = typeof patch === 'function' ? patch(ui) : patch;
  ui = { ...ui, ...p };
  listeners.forEach((l) => l());
}

export function getUI() {
  return ui;
}

export function useUI(): UIState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ui,
  );
}

let toastId = 0;
export function toast(message: string, opts: { undo?: boolean } = {}) {
  const id = ++toastId;
  setUI((u) => ({ toasts: [...u.toasts.slice(-2), { id, message, undo: opts.undo }] }));
  setTimeout(() => dismissToast(id), 5000);
}

export function dismissToast(id: number) {
  setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) }));
}

export function doUndo() {
  if (canUndo()) {
    undo();
    setUI({ toasts: [] });
    toast('Action undone');
  }
}

export const openDialog = (dialog: Dialog) => setUI({ dialog });
export const closeDialog = () => setUI({ dialog: null });
export const openTask = (id: string) => setUI({ detailTaskId: id });
export const openQuickAdd = (defaults: TaskDefaults = {}) => setUI({ quickAdd: defaults });

export function confirm(title: string, message: string, onConfirm: () => void, confirmLabel = 'Delete') {
  openDialog({ kind: 'confirm', title, message, onConfirm, confirmLabel });
}

// ---------- routing (hash based so it works on any static host) ----------

export function parseHash(hash: string): View {
  const path = hash.replace(/^#\/?/, '');
  const [kind, rest] = [path.split('/')[0], path.split('/').slice(1).join('/')];
  switch (kind) {
    case 'inbox': return { kind: 'inbox' };
    case 'upcoming': return { kind: 'upcoming' };
    case 'project': return rest ? { kind: 'project', id: rest } : { kind: 'today' };
    case 'label': return rest ? { kind: 'label', id: rest } : { kind: 'filters-labels' };
    case 'filter': return rest ? { kind: 'filter', id: rest } : { kind: 'filters-labels' };
    case 'filters-labels': return { kind: 'filters-labels' };
    case 'completed': return { kind: 'completed' };
    case 'search': return { kind: 'search', q: decodeURIComponent(rest) };
    default: return { kind: 'today' };
  }
}

export function viewToHash(v: View): string {
  switch (v.kind) {
    case 'project':
    case 'label':
    case 'filter':
      return `#/${v.kind}/${v.id}`;
    case 'search':
      return `#/search/${encodeURIComponent(v.q)}`;
    default:
      return `#/${v.kind}`;
  }
}

export function navigate(v: View) {
  const h = viewToHash(v);
  if (location.hash !== h) location.hash = h;
  if (isMobile()) setUI({ sidebarOpen: false });
}

export function useView(): View {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    () => location.hash,
  );
  return useMemo(() => parseHash(hash), [hash]);
}

export function viewKey(v: View): string {
  return v.kind === 'project' || v.kind === 'label' || v.kind === 'filter' ? `${v.kind}:${v.id}` : v.kind;
}
