import { useState } from 'react';
import {
  AlertTriangle, BellRing, CalendarPlus, Cloud, CloudOff, ExternalLink, History, Link2Off, RefreshCw,
} from 'lucide-react';
import { relativeTime, shortDate, todayISO } from '../dates';
import { buildICS } from '../ics';
import { notificationsSupported, requestNotifications } from '../reminders';
import { listBackups, restoreBackup, updateSettings, useAppState } from '../store';
import { beginConnect, disconnect, finishConnect, syncNow, useSyncStatus, type PendingConnect } from '../sync';
import { confirm, toast } from '../ui';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Leon%27s%20Planner%20sync';

export function SyncSection() {
  const st = useSyncStatus();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConnect | null>(null);

  if (pending) {
    const open = pending.remote.tasks.filter((t) => !t.completed).length;
    return (
      <section>
        <h4>Sync</h4>
        <div className="sync-card">
          <p>
            Found synced data on <strong>@{pending.login}</strong>: {open} open task{open === 1 ? '' : 's'} in{' '}
            {pending.remote.projects.length} project{pending.remote.projects.length === 1 ? '' : 's'}.
          </p>
          <p className="muted small">If this is your second device, use the synced data. Merging keeps everything from both, which can create duplicates of the starter projects.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => { finishConnect(pending, 'use-remote'); setPending(null); toast('Synced data loaded'); }}>
              Use synced data
            </button>
            <button className="btn outline" onClick={() => { finishConnect(pending, 'merge'); setPending(null); toast('Data merged'); }}>
              Merge both
            </button>
            <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      </section>
    );
  }

  if (st.phase === 'off') {
    return (
      <section>
        <h4>Sync</h4>
        <p className="small">Keep your phone and computer in sync using your GitHub account. Your data is saved in a secret gist that only appears in your own GitHub account.</p>
        <ol className="steps small">
          <li>
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">Create a GitHub token <ExternalLink size={12} /></a> — only the
            “gist” box needs to be ticked. Choose a long expiration (or none), then click “Generate token”.
          </li>
          <li>Paste the token below and connect. Do the same on your other device with the same token.</li>
        </ol>
        <div className="pop-row">
          <input
            type="password"
            placeholder="ghp_…"
            value={token}
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            className="btn primary"
            disabled={!token.trim() || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const p = await beginConnect(token);
                if (p) setPending(p);
                else toast('Sync is on');
                setToken('');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
      </section>
    );
  }

  return (
    <section>
      <h4>Sync</h4>
      <div className="sync-status">
        <SyncIcon size={18} />
        <div className="grow">
          <div>Syncing with GitHub{st.login ? ` as @${st.login}` : ''}</div>
          <div className="muted small">
            {st.phase === 'syncing' ? 'Syncing…'
              : st.phase === 'offline' ? 'Offline — changes will sync when you reconnect'
              : st.phase === 'error' ? st.error
              : st.lastSync ? `Last synced ${relativeTime(new Date(st.lastSync).toISOString())}` : 'Not synced yet'}
          </div>
        </div>
        <button className="btn outline sm" onClick={() => void syncNow()} disabled={st.phase === 'syncing'}>
          <RefreshCw size={14} /> Sync now
        </button>
        <button
          className="btn ghost sm"
          onClick={() =>
            confirm('Turn off sync on this device?', 'Your data stays on this device and in GitHub. You can reconnect any time with a token.', disconnect, 'Turn off')
          }
        >
          <Link2Off size={14} /> Disconnect
        </button>
      </div>
    </section>
  );
}

export function SyncIcon({ size = 16 }: { size?: number }) {
  const st = useSyncStatus();
  if (st.phase === 'off') return <CloudOff size={size} />;
  if (st.phase === 'syncing') return <RefreshCw size={size} className="spin" />;
  if (st.phase === 'error') return <AlertTriangle size={size} color="var(--due-overdue)" />;
  if (st.phase === 'offline') return <CloudOff size={size} color="var(--due-tomorrow)" />;
  return <Cloud size={size} color="var(--due-today)" />;
}

const DEFAULT_REMINDERS: Array<[number | null, string]> = [
  [null, 'Off'], [0, 'At time'], [10, '10 min'], [30, '30 min'], [60, '1 hour'],
];

export function RemindersSection() {
  const s = useAppState();
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'unsupported');
  return (
    <section>
      <h4>Reminders</h4>
      <div className="settings-row">
        <span className="grow">
          Notifications
          <span className="field-hint">
            {perm === 'granted' ? 'On for this device.'
              : perm === 'denied' ? 'Blocked — allow notifications for this site in your browser settings.'
              : perm === 'unsupported' ? 'This browser can’t show notifications. On iPhone, add the app to your Home Screen first.'
              : 'Allow this device to show reminder notifications.'}
          </span>
        </span>
        {perm === 'default' && (
          <button className="btn outline sm" onClick={async () => setPerm(await requestNotifications())}>
            <BellRing size={14} /> Enable
          </button>
        )}
      </div>
      <div className="settings-row">
        <span className="grow">
          Automatic reminder
          <span className="field-hint">For tasks with a time and no reminders of their own</span>
        </span>
        <div className="segmented sm">
          {DEFAULT_REMINDERS.map(([v, l]) => (
            <button key={l} className={s.settings.defaultReminder === v ? 'on' : ''} onClick={() => updateSettings({ defaultReminder: v })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">Reminders go off while the app is open or running in the background on this device.</p>
    </section>
  );
}

export function BackupsAndCalendar() {
  const s = useAppState();
  const [show, setShow] = useState(false);
  const backups = listBackups();
  return (
    <>
      <div className="row wrap">
        <button
          className="btn outline"
          onClick={() => {
            const blob = new Blob([buildICS(s)], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `planner-${todayISO()}.ics`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <CalendarPlus size={16} /> Export to calendar (.ics)
        </button>
        <button className="btn outline" onClick={() => setShow(!show)}>
          <History size={16} /> Automatic backups ({backups.length})
        </button>
      </div>
      {show && (
        <div className="backup-list">
          <p className="muted small">A snapshot is saved automatically each day you use the app (the last {7} days are kept on this device).</p>
          {backups.map((b) => (
            <div key={b.at} className="backup-row">
              <span className="grow">{shortDate(b.at.slice(0, 10))} · {new Date(b.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              <span className="muted small">{Math.round(b.data.length / 1024)} KB</span>
              <button
                className="btn ghost sm"
                onClick={() =>
                  confirm('Restore this backup?', 'Your current data will be replaced by this snapshot. You can undo right after.', () => {
                    restoreBackup(b);
                    toast('Backup restored', { undo: true });
                  }, 'Restore')
                }
              >
                Restore
              </button>
            </div>
          ))}
          {!backups.length && <p className="muted small">No backups yet.</p>}
        </div>
      )}
    </>
  );
}
