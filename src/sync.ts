import { useSyncExternalStore } from 'react';
import { getState, migrate, replaceState, subscribeState, SYNCED_COLLECTIONS } from './store';
import type { State } from './types';

/*
 * Sync between devices through a secret GitHub gist.
 *
 * Each device keeps its full state locally. Every change is time-stamped per entity
 * (see stamp() in store.ts), so syncing is: download the gist, merge it with local data
 * entity by entity (newest change wins, deletions win over older edits), keep the merged
 * result locally and upload it if it differs from what was downloaded.
 */

const TOKEN_KEY = 'leons-planner:sync-token';
const GIST_KEY = 'leons-planner:sync-gist';
const FILE = 'leons-planner.json';
const DESCRIPTION = "Leon's Planner sync data (managed by the app, don't edit)";
const API = 'https://api.github.com';
const TOMBSTONE_TTL = 120 * 86400000;

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  phase: SyncPhase;
  lastSync: number | null;
  error: string | null;
  login: string | null;
}

// ---------------- merge ----------------

type Entity = { id: string };

/** Deterministic tie-break so two devices always pick the same winner. */
const pick = <T,>(a: T, b: T) => (JSON.stringify(a) >= JSON.stringify(b) ? a : b);

export function mergeStates(local: State, remote: State): State {
  const stamps: Record<string, number> = {};
  const tombstones: Record<string, number> = {};
  const now = Date.now();
  for (const [k, v] of Object.entries({ ...remote.sync.tombstones, ...local.sync.tombstones })) {
    const t = Math.max(local.sync.tombstones[k] ?? 0, remote.sync.tombstones[k] ?? 0, v);
    if (now - t < TOMBSTONE_TTL) tombstones[k] = t;
  }

  const out = { ...local } as State;
  for (const c of SYNCED_COLLECTIONS) {
    const l = new Map((local[c] as Entity[]).map((x) => [x.id, x]));
    const r = new Map((remote[c] as Entity[]).map((x) => [x.id, x]));
    const merged: Entity[] = [];
    for (const id of new Set([...l.keys(), ...r.keys()])) {
      const key = `${c}:${id}`;
      const ls = local.sync.stamps[key] ?? 0;
      const rs = remote.sync.stamps[key] ?? 0;
      const a = l.get(id);
      const b = r.get(id);
      let winner: Entity | undefined;
      let at: number;
      if (a && b) {
        winner = ls > rs ? a : rs > ls ? b : pick(a, b);
        at = Math.max(ls, rs);
      } else {
        winner = a ?? b;
        at = a ? ls : rs;
      }
      const deletedAt = tombstones[key] ?? 0;
      if (deletedAt && deletedAt >= at) continue;
      delete tombstones[key];
      if (at) stamps[key] = at;
      merged.push(winner!);
    }
    (out as unknown as Record<string, Entity[]>)[c] = merged;
  }

  // settings and view options: newest wins
  const ls = local.sync.stamps.settings ?? 0;
  const rs = remote.sync.stamps.settings ?? 0;
  out.settings = rs > ls ? remote.settings : local.settings;
  if (ls || rs) stamps.settings = Math.max(ls, rs);
  out.viewOptions = {};
  for (const k of new Set([...Object.keys(local.viewOptions), ...Object.keys(remote.viewOptions)])) {
    const key = `viewOptions:${k}`;
    const a = local.sync.stamps[key] ?? 0;
    const b = remote.sync.stamps[key] ?? 0;
    const v = b > a ? remote.viewOptions[k] ?? local.viewOptions[k] : local.viewOptions[k] ?? remote.viewOptions[k];
    if (v) out.viewOptions[k] = v;
    if (a || b) stamps[key] = Math.max(a, b);
  }

  out.sync = { stamps, tombstones };
  return repair(out);
}

/** Fix references broken by concurrent edits (e.g. a task added to a project deleted on another device). */
function repair(s: State): State {
  const inbox = s.projects.find((p) => p.isInbox) ?? s.projects[0];
  const projectIds = new Set(s.projects.map((p) => p.id));
  const sectionIds = new Set(s.sections.map((x) => x.id));
  const taskIds = new Set(s.tasks.map((t) => t.id));
  let changed = false;
  const projects = s.projects.map((p) => {
    if (p.parentId && !projectIds.has(p.parentId)) {
      changed = true;
      return { ...p, parentId: null };
    }
    return p;
  });
  const sections = s.sections.filter((x) => projectIds.has(x.projectId));
  if (sections.length !== s.sections.length) changed = true;
  const liveSections = new Set(sections.map((x) => x.id));
  const tasks = s.tasks.map((t) => {
    const fix: Partial<typeof t> = {};
    if (!projectIds.has(t.projectId)) Object.assign(fix, { projectId: inbox.id, sectionId: null });
    if (t.sectionId && (!sectionIds.has(t.sectionId) || !liveSections.has(t.sectionId))) fix.sectionId = null;
    if (t.parentId && !taskIds.has(t.parentId)) fix.parentId = null;
    if (Object.keys(fix).length) {
      changed = true;
      return { ...t, ...fix };
    }
    return t;
  });
  return changed ? { ...s, projects, sections, tasks } : s;
}

// ---------------- GitHub API ----------------

class SyncError extends Error {}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new SyncError('offline');
  }
  if (res.status === 401) throw new SyncError('The GitHub token was rejected. It may have expired — create a new one.');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new SyncError('GitHub rate limit reached. Sync will resume shortly.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new SyncError('The token can’t access gists. Make sure it has the “gist” permission.');
  }
  if (!res.ok) throw new SyncError(`GitHub returned an error (${res.status}). Will retry.`);
  return res.json() as Promise<T>;
}

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}
interface Gist {
  id: string;
  description: string | null;
  files: Record<string, GistFile>;
}

async function readGist(token: string, id: string): Promise<State | null> {
  const g = await api<Gist>(token, `/gists/${id}`);
  const f = g.files[FILE];
  if (!f) return null;
  let text = f.content ?? '';
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  if (!text.trim()) return null;
  const data = JSON.parse(text) as State;
  if (data?.version !== 1 || !Array.isArray(data.tasks)) throw new SyncError('The synced data looks damaged.');
  return migrate(data);
}

async function writeGist(token: string, id: string, s: State) {
  await api(token, `/gists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(s) } } }),
  });
}

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const list = await api<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.description === DESCRIPTION || FILE in g.files);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

// ---------------- status store ----------------

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

let status: SyncStatus = {
  phase: read(TOKEN_KEY) && read(GIST_KEY) ? 'idle' : 'off',
  lastSync: Number(read('leons-planner:last-sync')) || null,
  error: null,
  login: read('leons-planner:sync-login'),
};
const listeners = new Set<() => void>();
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

// ---------------- connect / disconnect ----------------

export interface PendingConnect {
  token: string;
  login: string;
  gistId: string;
  remote: State;
}

/**
 * Check a token and look for existing sync data.
 * Returns null when this is the first device (a new gist was created and filled),
 * or the remote data so the caller can ask whether to merge or replace.
 */
export async function beginConnect(token: string): Promise<PendingConnect | null> {
  token = token.trim();
  try {
    const user = await api<{ login: string }>(token, '/user');
    const existing = await findGist(token);
    if (existing) {
      const remote = await readGist(token, existing);
      if (remote) return { token, login: user.login, gistId: existing, remote };
      finishConnect({ token, login: user.login, gistId: existing, remote: getState() }, 'replace-remote');
      return null;
    }
    const created = await api<Gist>(token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(getState()) } } }),
    });
    finishConnect({ token, login: user.login, gistId: created.id, remote: getState() }, 'replace-remote');
    return null;
  } catch (e) {
    throw new Error(e instanceof SyncError && e.message === 'offline' ? 'Could not reach GitHub. Check your connection.' : (e as Error).message);
  }
}

/**
 * 'use-remote': this device takes the synced data (recommended for a second device).
 * 'merge': combine both.
 * 'replace-remote': first device — upload what's here.
 */
export function finishConnect(p: PendingConnect, mode: 'use-remote' | 'merge' | 'replace-remote') {
  write(TOKEN_KEY, p.token);
  write(GIST_KEY, p.gistId);
  write('leons-planner:sync-login', p.login);
  if (mode === 'use-remote') replaceState(p.remote);
  else if (mode === 'merge') replaceState(mergeStates(getState(), p.remote));
  setStatus({ phase: 'idle', error: null, login: p.login });
  if (mode !== 'use-remote') dirty = true;
  void syncNow();
}

export function disconnect() {
  write(TOKEN_KEY, null);
  write(GIST_KEY, null);
  write('leons-planner:sync-login', null);
  setStatus({ phase: 'off', error: null, login: null, lastSync: null });
}

// ---------------- sync loop ----------------

let running: Promise<void> | null = null;
let again = false;
let dirty = false;
let applying = false;

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function syncOnce() {
  const token = read(TOKEN_KEY);
  const gistId = read(GIST_KEY);
  if (!token || !gistId) return;
  if (!navigator.onLine) return setStatus({ phase: 'offline' });
  setStatus({ phase: 'syncing' });
  try {
    const remote = await readGist(token, gistId);
    const before = getState();
    const merged = remote ? mergeStates(before, remote) : before;
    const remoteJson = remote ? canonical(remote) : '';
    const mergedJson = canonical(merged);
    if (mergedJson !== canonical(before)) {
      // a local edit made while we were downloading must not be lost: merge it in too
      const latest = getState();
      const final = latest === before ? merged : mergeStates(latest, merged);
      applying = true;
      replaceState(final);
      applying = false;
    }
    if (mergedJson !== remoteJson) {
      await writeGist(token, gistId, getState());
    }
    dirty = false;
    const now = Date.now();
    write('leons-planner:last-sync', String(now));
    setStatus({ phase: 'idle', error: null, lastSync: now });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'offline') setStatus({ phase: 'offline' });
    else setStatus({ phase: 'error', error: msg });
  }
}

/** Order-independent serialisation, so equal data compares equal across devices. */
function canonical(s: State): string {
  const sorted = { ...s } as unknown as Record<string, unknown>;
  for (const c of SYNCED_COLLECTIONS) {
    sorted[c] = [...(s[c] as Entity[])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return stable(sorted);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

let debounce = 0;

export function startSync() {
  subscribeState(() => {
    if (applying || status.phase === 'off') return;
    dirty = true;
    clearTimeout(debounce);
    debounce = window.setTimeout(() => void syncNow(), 1500);
  });
  const kick = () => {
    if (status.phase !== 'off' && document.visibilityState === 'visible') void syncNow();
  };
  window.addEventListener('focus', kick);
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', kick);
  // push pending edits before the page goes away (e.g. phone switching apps)
  window.addEventListener('pagehide', () => {
    if (dirty) void syncNow();
  });
  setInterval(kick, 30000);
  kick();
}

export function isSyncConfigured() {
  return status.phase !== 'off';
}
