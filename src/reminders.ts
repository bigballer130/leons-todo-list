import { dueInfo, reminderTime } from './dates';
import { getState } from './store';
import type { Reminder, Task } from './types';
import { openTask, toast } from './ui';

const FIRED_KEY = 'leons-planner:fired-reminders';
/** Reminders missed by more than this (app was closed) are skipped rather than fired late. */
const GRACE_MS = 15 * 60 * 1000;

function loadFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveFired(f: Record<string, number>) {
  const cutoff = Date.now() - 3 * 86400000;
  for (const k of Object.keys(f)) if (f[k] < cutoff) delete f[k];
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

export function effectiveReminders(t: Task): Reminder[] {
  if (t.reminders.length) return t.reminders;
  const def = getState().settings.defaultReminder;
  if (def !== null && t.due?.time) return [{ id: 'default', type: 'relative', minutes: def }];
  return [];
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

async function notify(task: Task, key: string) {
  const body = task.due ? dueInfo(task.due).label : 'Reminder';
  toast(`🔔 ${task.content}`);
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag: key, icon: './icon.svg', data: { taskId: task.id } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(task.content, options));
    const n = new Notification(task.content, options);
    n.onclick = () => {
      window.focus();
      openTask(task.id);
    };
  } catch {
    /* some browsers only allow notifications from an installed app */
  }
}

function check() {
  const now = Date.now();
  const fired = loadFired();
  let changed = false;
  for (const t of getState().tasks) {
    if (t.completed) continue;
    for (const r of effectiveReminders(t)) {
      const at = reminderTime(r, t.due);
      if (at === null || at > now) continue;
      const key = `${t.id}:${r.id}:${at}`;
      if (fired[key]) continue;
      fired[key] = now;
      changed = true;
      if (now - at <= GRACE_MS) void notify(t, key);
    }
  }
  if (changed) saveFired(fired);
}

export function startReminders() {
  check();
  setInterval(check, 20000);
  document.addEventListener('visibilitychange', check);
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'open-task' && e.data.id) openTask(e.data.id);
  });
}
