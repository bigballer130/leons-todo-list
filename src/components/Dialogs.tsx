import { useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Check, ChevronDown, Columns3, Download, LayoutTemplate, List, RotateCcw, Table2, Upload,
} from 'lucide-react';
import { BUILT_IN_TEMPLATES } from '../templates';
import { ACCENTS, colorHex, COLORS } from '../colors';
import { addDays, startOfWeek, toISO, todayISO, WEEKDAYS_SHORT, fromISO } from '../dates';
import { compileQuery } from '../query';
import {
  addFilter, addLabel, addProject, createFromTemplate, exportData, importData, resetData, updateFilter, updateLabel, updateProject,
  updateSettings, useAppState,
} from '../store';
import type { Layout, Settings } from '../types';
import { closeDialog, confirm, navigate, toast, useUI, type Dialog } from '../ui';
import { Modal } from './Modal';
import { orderedProjects } from './Pickers';
import { Menu, useAnchor } from './Popover';
import { Toggle } from '../views/common';
import { BackupsAndCalendar, RemindersSection, SyncSection } from './SettingsSections';

function ColorSelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [a, open, close] = useAnchor();
  const c = COLORS.find((x) => x.id === value) ?? COLORS[0];
  return (
    <>
      <button type="button" className="select-btn" onClick={(e) => open(e.currentTarget)}>
        <span className="swatch" style={{ background: c.hex }} />
        <span className="grow">{c.name}</span>
        <ChevronDown size={14} />
      </button>
      {a && (
        <Menu
          anchor={a}
          onClose={close}
          width={a.offsetWidth}
          items={COLORS.map((x) => ({
            label: x.name,
            icon: <span className="swatch" style={{ background: x.hex }} />,
            checked: x.id === value,
            onClick: () => onChange(x.id),
          }))}
        />
      )}
    </>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function ProjectDialog({ id, parentId }: { id?: string; parentId?: string | null }) {
  const s = useAppState();
  const existing = s.projects.find((p) => p.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? 'grey');
  const [parent, setParent] = useState<string | null>(existing?.parentId ?? parentId ?? null);
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [layout, setLayout] = useState<Layout>(existing?.layout ?? 'list');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [pa, openP, closeP] = useAnchor();
  const [ta, openT, closeT] = useAnchor();
  const templates = [...s.templates, ...BUILT_IN_TEMPLATES];
  const template = templates.find((t) => t.id === templateId) ?? null;
  const parentOptions = orderedProjects(s.projects).filter((r) => r.p.id !== id);
  const parentName = parent ? s.projects.find((p) => p.id === parent)?.name : 'No parent';

  const submit = () => {
    if (!name.trim()) return;
    if (existing) updateProject(existing.id, { name: name.trim(), color, parentId: parent, favorite, layout });
    else if (template) {
      const p = createFromTemplate({ ...template, color, layout }, name.trim(), parent);
      if (favorite) updateProject(p.id, { favorite });
      navigate({ kind: 'project', id: p.id });
    } else {
      const p = addProject({ name: name.trim(), color, parentId: parent, favorite, layout });
      navigate({ kind: 'project', id: p.id });
    }
    closeDialog();
  };

  return (
    <Modal
      onClose={closeDialog}
      title={existing ? 'Edit project' : 'Add project'}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={submit}>{existing ? 'Save' : 'Add'}</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {!existing && (
          <Field label="Start from">
            <button type="button" className="select-btn" onClick={(e) => openT(e.currentTarget)}>
              <LayoutTemplate size={14} />
              <span className="grow">{template ? `${template.name} (${template.tasks.length} tasks)` : 'Blank project'}</span>
              <ChevronDown size={14} />
            </button>
          </Field>
        )}
        {ta && (
          <Menu
            anchor={ta}
            onClose={closeT}
            width={ta.offsetWidth}
            items={[
              { label: 'Blank project', checked: !template, onClick: () => setTemplateId(null) },
              ...(s.templates.length ? [{ divider: true }] : []),
              ...s.templates.map((t) => ({
                label: t.name,
                hint: 'yours',
                checked: templateId === t.id,
                onClick: () => {
                  setTemplateId(t.id);
                  if (!name.trim()) setName(t.name);
                  setColor(t.color);
                  setLayout(t.layout);
                },
              })),
              { divider: true },
              ...BUILT_IN_TEMPLATES.map((t) => ({
                label: t.name,
                checked: templateId === t.id,
                onClick: () => {
                  setTemplateId(t.id);
                  if (!name.trim()) setName(t.name);
                  setColor(t.color);
                  setLayout(t.layout);
                },
              })),
            ]}
          />
        )}
        <Field label="Name">
          <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Color">
          <ColorSelect value={color} onChange={setColor} />
        </Field>
        <Field label="Parent project">
          <button type="button" className="select-btn" onClick={(e) => openP(e.currentTarget)}>
            <span className="grow">{parentName}</span>
            <ChevronDown size={14} />
          </button>
        </Field>
        {pa && (
          <Menu
            anchor={pa}
            onClose={closeP}
            width={pa.offsetWidth}
            items={[
              { label: 'No parent', checked: !parent, onClick: () => setParent(null) },
              ...parentOptions.map((r) => ({
                label: `${'   '.repeat(r.depth)}${r.p.name}`,
                icon: <span className="hash" style={{ color: colorHex(r.p.color) }}>#</span>,
                checked: parent === r.p.id,
                onClick: () => setParent(r.p.id),
              })),
            ]}
          />
        )}
        <label className="vo-row">
          <span className="grow">Add to favorites</span>
          <Toggle on={favorite} onChange={setFavorite} />
        </label>
        <div className="field">
          <span className="field-label">Layout</span>
          <div className="segmented">
            <button type="button" className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')}><List size={18} /> List</button>
            <button type="button" className={layout === 'board' ? 'on' : ''} onClick={() => setLayout('board')}><Columns3 size={18} /> Board</button>
            <button type="button" className={layout === 'calendar' ? 'on' : ''} onClick={() => setLayout('calendar')}><CalendarDays size={18} /> Calendar</button>
            <button type="button" className={layout === 'table' ? 'on' : ''} onClick={() => setLayout('table')}><Table2 size={18} /> Table</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function LabelDialog({ id }: { id?: string }) {
  const s = useAppState();
  const existing = s.labels.find((l) => l.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? 'grey');
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const clean = name.trim().replace(/\s+/g, '_').replace(/^@/, '');
  const dup = s.labels.some((l) => l.id !== id && l.name.toLowerCase() === clean.toLowerCase());
  const submit = () => {
    if (!clean || dup) return;
    if (existing) updateLabel(existing.id, { name: clean, color, favorite });
    else addLabel({ name: clean, color, favorite });
    closeDialog();
  };
  return (
    <Modal
      onClose={closeDialog}
      title={existing ? 'Edit label' : 'Add label'}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn primary" disabled={!clean || dup} onClick={submit}>{existing ? 'Save' : 'Add'}</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Label name" hint={dup ? <span className="error">A label with this name already exists</span> : undefined}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Color"><ColorSelect value={color} onChange={setColor} /></Field>
        <label className="vo-row">
          <span className="grow">Add to favorites</span>
          <Toggle on={favorite} onChange={setFavorite} />
        </label>
      </form>
    </Modal>
  );
}

function FilterDialog({ id, query: initialQuery }: { id?: string; query?: string }) {
  const s = useAppState();
  const existing = s.filters.find((f) => f.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [query, setQuery] = useState(existing?.query ?? initialQuery ?? '');
  const [color, setColor] = useState(existing?.color ?? 'grey');
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const fn = useMemo(() => (query.trim() ? compileQuery(query) : null), [query]);
  const matches = fn ? s.tasks.filter((t) => !t.completed && fn(t, s)).length : 0;
  const submit = () => {
    if (!name.trim() || !fn) return;
    if (existing) updateFilter(existing.id, { name: name.trim(), query: query.trim(), color, favorite });
    else {
      const f = addFilter({ name: name.trim(), query: query.trim(), color, favorite });
      navigate({ kind: 'filter', id: f.id });
    }
    closeDialog();
  };
  return (
    <Modal
      onClose={closeDialog}
      title={existing ? 'Edit filter' : 'Add filter'}
      width={500}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || !fn} onClick={submit}>{existing ? 'Save' : 'Add'}</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field
          label="Query"
          hint={
            query.trim() ? (
              fn ? `${matches} open task${matches === 1 ? '' : 's'} match` : <span className="error">Query not understood</span>
            ) : (
              'e.g. today | overdue, p1 & #Work, @errands, 7 days, no date, !recurring'
            )
          }
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="today & p1" />
        </Field>
        <details className="query-help">
          <summary>Query reference</summary>
          <table>
            <tbody>
              <tr><td><code>today</code> <code>tomorrow</code> <code>overdue</code></td><td>By due date</td></tr>
              <tr><td><code>7 days</code> <code>no date</code> <code>recurring</code></td><td>Upcoming window, undated, repeating</td></tr>
              <tr><td><code>due before: fri</code> <code>due after: jan 1</code></td><td>Date ranges</td></tr>
              <tr><td><code>p1</code> … <code>p4</code></td><td>By priority</td></tr>
              <tr><td><code>#Work</code> <code>##Work</code> <code>/Section</code></td><td>Project (## includes sub-projects), section</td></tr>
              <tr><td><code>@label</code> <code>@home*</code> <code>no labels</code></td><td>Labels (* is a wildcard)</td></tr>
              <tr><td><code>search: text</code></td><td>Text in name or description</td></tr>
              <tr><td><code>&amp;</code> <code>|</code> <code>!</code> <code>( )</code></td><td>And, or, not, grouping</td></tr>
            </tbody>
          </table>
        </details>
        <Field label="Color"><ColorSelect value={color} onChange={setColor} /></Field>
        <label className="vo-row">
          <span className="grow">Add to favorites</span>
          <Toggle on={favorite} onChange={setFavorite} />
        </label>
      </form>
    </Modal>
  );
}

function SettingsDialog() {
  const s = useAppState();
  const set = (p: Partial<Settings>) => updateSettings(p);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = s.settings;
  return (
    <Modal onClose={closeDialog} title="Settings" width={560}>
      <div className="settings">
        <SyncSection />
        <section>
          <h4>General</h4>
          <Field label="Your name">
            <input value={st.userName} onChange={(e) => set({ userName: e.target.value })} />
          </Field>
          <div className="settings-row">
            <span className="grow">Start of week</span>
            <div className="segmented sm">
              <button className={st.weekStart === 1 ? 'on' : ''} onClick={() => set({ weekStart: 1 })}>Monday</button>
              <button className={st.weekStart === 0 ? 'on' : ''} onClick={() => set({ weekStart: 0 })}>Sunday</button>
            </div>
          </div>
          <div className="settings-row">
            <span className="grow">Time format</span>
            <div className="segmented sm">
              <button className={st.timeFormat === '12h' ? 'on' : ''} onClick={() => set({ timeFormat: '12h' })}>1:00 PM</button>
              <button className={st.timeFormat === '24h' ? 'on' : ''} onClick={() => set({ timeFormat: '24h' })}>13:00</button>
            </div>
          </div>
          <label className="settings-row">
            <span className="grow">
              Smart date recognition
              <span className="field-hint">Detect dates like “tomorrow 5pm” while typing a task name</span>
            </span>
            <Toggle on={st.smartDate} onChange={(v) => set({ smartDate: v })} />
          </label>
        </section>
        <section>
          <h4>Theme</h4>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={st.theme === t ? 'on' : ''} onClick={() => set({ theme: t })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="accent-grid">
            {ACCENTS.map((a) => (
              <button key={a.id} className={`accent-opt ${st.accent === a.id ? 'on' : ''}`} onClick={() => set({ accent: a.id })}>
                <span className="accent-swatch" style={{ background: a.hex }}>{st.accent === a.id && <Check size={14} color="#fff" />}</span>
                {a.name}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4>Goals</h4>
          <div className="settings-row">
            <span className="grow">Daily goal</span>
            <input type="number" min={1} max={100} className="num" value={st.dailyGoal} onChange={(e) => set({ dailyGoal: Math.max(1, +e.target.value || 1) })} />
          </div>
          <div className="settings-row">
            <span className="grow">Weekly goal</span>
            <input type="number" min={1} max={500} className="num" value={st.weeklyGoal} onChange={(e) => set({ weeklyGoal: Math.max(1, +e.target.value || 1) })} />
          </div>
        </section>
        <RemindersSection />
        <section>
          <h4>Data</h4>
          <p className="muted small">Your data is stored on this device{' '}(and in your GitHub gist when sync is on). Export a backup file any time.</p>
          <BackupsAndCalendar />
          <div className="row wrap">
            <button
              className="btn outline"
              onClick={() => {
                const blob = new Blob([exportData()], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `planner-backup-${todayISO()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={16} /> Export backup
            </button>
            <button className="btn outline" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importData(await f.text());
                  toast('Backup imported', { undo: true });
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Import failed');
                }
                e.target.value = '';
              }}
            />
            <button
              className="btn outline danger"
              onClick={() =>
                confirm('Start over?', 'All projects, tasks, labels and filters will be erased and replaced with an empty Inbox.', () => {
                  resetData(true);
                  navigate({ kind: 'inbox' });
                }, 'Erase everything')
              }
            >
              <RotateCcw size={16} /> Reset
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

const SHORTCUTS: Array<[string, Array<[string, string]>]> = [
  ['Quick', [['Q', 'Quick add task'], ['A', 'Add task at the end of the list'], ['/  or  Ctrl K', 'Search'], ['M', 'Toggle sidebar'], ['?', 'Show shortcuts'], ['Ctrl Z', 'Undo']]],
  ['Navigate', [['G  I', 'Go to Inbox'], ['G  T', 'Go to Today'], ['G  U', 'Go to Upcoming'], ['G  V', 'Go to Filters & Labels'], ['G  C', 'Go to Completed'], ['O  S', 'Open settings']]],
  ['Task editor', [['Enter', 'Save task'], ['Shift Enter', 'Save from description (Ctrl Enter)'], ['Esc', 'Cancel'], ['#', 'Pick a project'], ['@', 'Add a label'], ['p1 … p4', 'Set priority'], ['/', 'Pick a section']]],
];

function ShortcutsDialog() {
  return (
    <Modal onClose={closeDialog} title="Keyboard shortcuts" width={560}>
      <div className="shortcuts">
        {SHORTCUTS.map(([group, list]) => (
          <section key={group}>
            <h4>{group}</h4>
            {list.map(([k, d]) => (
              <div key={k} className="shortcut-row">
                <span>{d}</span>
                <span className="keys">{k.split(/\s{2,}|\s/).filter(Boolean).map((x, i) => <kbd key={i}>{x}</kbd>)}</span>
              </div>
            ))}
          </section>
        ))}
        <section>
          <h4>Quick add examples</h4>
          <div className="examples">
            <code>Call mom tomorrow at 6pm</code>
            <code>Pay rent every 1st p1 #Home</code>
            <code>Gym every mon, wed, fri 7am @health</code>
            <code>Submit report next friday #Work /Reports</code>
            <code>Renew passport in 3 weeks</code>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function ProductivityDialog() {
  const s = useAppState();
  const today = todayISO();
  const byDay = new Map<string, number>();
  for (const l of s.log) {
    const d = toISO(new Date(l.completedAt));
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const doneToday = byDay.get(today) ?? 0;
  const ws = startOfWeek(today, s.settings.weekStart);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const doneWeek = week.reduce((n, d) => n + (byDay.get(d) ?? 0), 0);
  // streak: consecutive days (ending today or yesterday) that hit the daily goal
  let streak = 0;
  let d = (byDay.get(today) ?? 0) >= s.settings.dailyGoal ? today : addDays(today, -1);
  while ((byDay.get(d) ?? 0) >= s.settings.dailyGoal) {
    streak++;
    d = addDays(d, -1);
  }
  const pct = (n: number, g: number) => Math.min(100, Math.round((n / g) * 100));
  return (
    <Modal onClose={closeDialog} title="Productivity" width={480}>
      <div className="productivity">
        <div className="ring-row">
          <Ring value={pct(doneToday, s.settings.dailyGoal)} label={`${doneToday}/${s.settings.dailyGoal}`} caption="Daily goal" />
          <Ring value={pct(doneWeek, s.settings.weeklyGoal)} label={`${doneWeek}/${s.settings.weeklyGoal}`} caption="Weekly goal" />
          <div className="streak">
            <strong>{streak}</strong>
            <span>day streak</span>
          </div>
        </div>
        <div className="week-bars">
          {week.map((day) => {
            const n = byDay.get(day) ?? 0;
            return (
              <div key={day} className={`wb ${day === today ? 'today' : ''}`}>
                <div className="wb-track"><div className="wb-fill" style={{ height: `${pct(n, s.settings.dailyGoal)}%` }} /></div>
                <span>{WEEKDAYS_SHORT[fromISO(day).getDay()][0]}</span>
              </div>
            );
          })}
        </div>
        <p className="muted small">Total completed: {s.log.length}. Change goals in Settings.</p>
      </div>
    </Modal>
  );
}

function Ring({ value, label, caption }: { value: number; label: string; caption: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} stroke="var(--bg-hover)" strokeWidth="8" fill="none" />
        <circle
          cx="42" cy="42" r={r} stroke="var(--accent)" strokeWidth="8" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{label}</text>
      </svg>
      <span>{caption}</span>
    </div>
  );
}

function ConfirmDialog({ d }: { d: Extract<Dialog, { kind: 'confirm' }> }) {
  return (
    <Modal
      onClose={closeDialog}
      width={420}
      top
      title={d.title}
      footer={
        <>
          <button className="btn ghost" onClick={closeDialog}>Cancel</button>
          <button
            className="btn danger-fill"
            autoFocus
            onClick={() => {
              closeDialog();
              d.onConfirm();
            }}
          >
            {d.confirmLabel ?? 'Delete'}
          </button>
        </>
      }
    >
      <p className="confirm-msg">{d.message}</p>
    </Modal>
  );
}

export function Dialogs() {
  const { dialog } = useUI();
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'project': return <ProjectDialog id={dialog.id} parentId={dialog.parentId} />;
    case 'label': return <LabelDialog id={dialog.id} />;
    case 'filter': return <FilterDialog id={dialog.id} query={dialog.query} />;
    case 'settings': return <SettingsDialog />;
    case 'shortcuts': return <ShortcutsDialog />;
    case 'productivity': return <ProductivityDialog />;
    case 'confirm': return <ConfirmDialog d={dialog} />;
  }
}
