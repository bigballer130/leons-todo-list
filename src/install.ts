import { useSyncExternalStore } from 'react';

/** The browser's deferred "install this app" prompt (Chrome / Edge). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

let snapshot = { canPrompt: !!deferred, installed };
function getSnapshot() {
  if (snapshot.canPrompt !== !!deferred || snapshot.installed !== installed) snapshot = { canPrompt: !!deferred, installed };
  return snapshot;
}

export function useInstall() {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getSnapshot);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  emit();
  return outcome === 'accepted';
}

/** Manual install steps for the current browser, when it has no install prompt to show. */
export function installSteps(): { browser: string; steps: string[] } {
  const ua = navigator.userAgent;
  const mac = /Macintosh/.test(ua);
  if (/Edg\//.test(ua)) {
    return { browser: 'Edge', steps: ['Open the ⋯ menu at the top right.', 'Choose Apps → Install this site as an app.', 'Tick “Create Desktop shortcut” if asked, then Install.'] };
  }
  if (/Chrome\//.test(ua)) {
    return {
      browser: 'Chrome',
      steps: [
        'Click the install icon at the right end of the address bar, or open the ⋮ menu → Cast, save and share → Install page as app.',
        mac
          ? 'Click Install. The app opens in its own window and is added to Applications → Chrome Apps; drag it from there onto your desktop or Dock.'
          : 'Click Install. To add a desktop icon, open chrome://apps, right-click To-Do List → Create shortcuts → Desktop.',
      ],
    };
  }
  if (/Safari\//.test(ua) && mac) {
    return { browser: 'Safari', steps: ['Choose File → Add to Dock.', 'Name it “To-Do List” and click Add. It also appears in Launchpad and can be dragged to the desktop.'] };
  }
  if (/Firefox\//.test(ua)) {
    return {
      browser: 'Firefox',
      steps: ['Firefox can’t install web apps. Open this page in Chrome or Edge and use their install option for a proper app with the checklist icon.'],
    };
  }
  return { browser: 'your browser', steps: ['Use your browser’s menu to install this page as an app, or add it to your home screen.'] };
}
