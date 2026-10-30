import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CircleCheckBig, CornerDownLeft, Inbox, LayoutGrid, Plus, Search, Settings, SlidersHorizontal, Tag, X,
} from 'lucide-react';
import { colorHex } from '../colors';
import { dueInfo } from '../dates';
import { addTask, useAppState } from '../store';
import type { View } from '../types';
import { dismissToast, doUndo, navigate, openDialog, openQuickAdd, openTask, setUI, useUI } from '../ui';
import { Modal } from './Modal';
import { ProjectIcon } from './Pickers';
import { TaskEditor } from './TaskEditor';
import { announceAdd, draftFrom } from './TaskList';
import { renderInline } from './TaskItem';
import { searchTasks } from '../views/OtherViews';

export function QuickAdd() {
  const { quickAdd } = useUI();
  if (!quickAdd) return null;
  return (
    <Modal onClose={() => setUI({ quickAdd: null })} width={560} className="quick-add-modal" top>
      <TaskEditor
        mode="add"
        variant="modal"
        initial={draftFrom(quickAdd)}
        onCancel={() => setUI({ quickAdd: null })}
        onSubmit={(d) => {
          const t = addTask(d);
          setUI({ quickAdd: null });
          announceAdd(t, { projectId: '__none__' });
        }}
      />
    </Modal>
  );
}

interface Result {
  key: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  run: () => void;
}

export function SearchPalette() {
  const { search } = useUI();
  if (!search) return null;
  return <Palette />;
}

function Palette() {
  const s = useAppState();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => setUI({ search: false });
  const go = (v: View) => {
    navigate(v);
    close();
  };

  const results: Array<{ group: string; items: Result[] }> = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const nav: Result[] = [
      { key: 'n-inbox', icon: <Inbox size={16} />, label: 'Inbox', run: () => go({ kind: 'inbox' }) },
      { key: 'n-today', icon: <CalendarDays size={16} />, label: 'Today', run: () => go({ kind: 'today' }) },
      { key: 'n-up', icon: <CalendarDays size={16} />, label: 'Upcoming', run: () => go({ kind: 'upcoming' }) },
      { key: 'n-fl', icon: <LayoutGrid size={16} />, label: 'Filters & Labels', run: () => go({ kind: 'filters-labels' }) },
      { key: 'n-done', icon: <CircleCheckBig size={16} />, label: 'Completed', run: () => go({ kind: 'completed' }) },
      { key: 'n-set', icon: <Settings size={16} />, label: 'Settings', run: () => { close(); openDialog({ kind: 'settings' }); } },
      { key: 'n-add', icon: <Plus size={16} />, label: 'Add task', run: () => { close(); openQuickAdd(); } },
      { key: 'n-proj', icon: <Plus size={16} />, label: 'Add project', run: () => { close(); openDialog({ kind: 'project' }); } },
    ];
    if (!ql) {
      const recent = [...s.tasks].filter((t) => !t.completed).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
      return [
        { group: 'Navigation', items: nav },
        {
          group: 'Recently added',
          items: recent.map((t) => ({
            key: t.id,
            icon: <span className={`mini-check p${t.priority}`} />,
            label: renderInline(t.content),
            run: () => { close(); openTask(t.id); },
          })),
        },
      ];
    }
    const tasks = searchTasks(s.tasks, ql).sort((a, b) => Number(a.completed) - Number(b.completed)).slice(0, 30);
    const projects = s.projects.filter((p) => p.name.toLowerCase().includes(ql));
    const labels = s.labels.filter((l) => l.name.toLowerCase().includes(ql));
    const filters = s.filters.filter((f) => f.name.toLowerCase().includes(ql));
    return [
      { group: 'Navigation', items: nav.filter((n) => String(n.label).toLowerCase().includes(ql)) },
      {
        group: 'Tasks',
        items: [
          ...tasks.map((t) => {
            const p = s.projects.find((x) => x.id === t.projectId);
            return {
              key: t.id,
              icon: <span className={`mini-check p${t.priority} ${t.completed ? 'done' : ''}`} />,
              label: <span className={t.completed ? 'strike' : ''}>{renderInline(t.content)}</span>,
              hint: (
                <>
                  {t.due && <span className={`due-${dueInfo(t.due).tone}`}>{dueInfo(t.due).label}</span>} {p?.name}
                </>
              ),
              run: () => { close(); openTask(t.id); },
            };
          }),
          ...(tasks.length
            ? [{ key: 'all', icon: <Search size={16} />, label: <>See all results for “{q.trim()}”</>, run: () => go({ kind: 'search', q: q.trim() }) }]
            : []),
        ],
      },
      {
        group: 'Projects',
        items: projects.map((p) => ({
          key: p.id, icon: <ProjectIcon project={p} />, label: p.name,
          run: () => go(p.isInbox ? { kind: 'inbox' } : { kind: 'project', id: p.id }),
        })),
      },
      {
        group: 'Labels',
        items: labels.map((l) => ({ key: l.id, icon: <Tag size={16} color={colorHex(l.color)} />, label: l.name, run: () => go({ kind: 'label', id: l.id }) })),
      },
      {
        group: 'Filters',
        items: filters.map((f) => ({ key: f.id, icon: <SlidersHorizontal size={16} color={colorHex(f.color)} />, label: f.name, run: () => go({ kind: 'filter', id: f.id }) })),
      },
    ].filter((g) => g.items.length);
  }, [q, s]);

  const flat = results.flatMap((g) => g.items);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  let i = -1;
  return (
    <Modal onClose={close} width={620} className="palette" top>
      <div className="pal-input">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Search tasks, projects, labels…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(flat.length - 1, x + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (flat[sel]) flat[sel].run();
              else if (q.trim()) go({ kind: 'search', q: q.trim() });
            }
          }}
        />
        <button className="icon-btn sm" onClick={close} aria-label="Close search"><X size={16} /></button>
      </div>
      <div className="pal-list" ref={listRef}>
        {results.map((g) => (
          <div key={g.group}>
            <div className="pal-group">{g.group}</div>
            {g.items.map((r) => {
              i++;
              const idx = i;
              return (
                <button key={r.key} className={`pal-item ${idx === sel ? 'sel' : ''}`} onMouseMove={() => setSel(idx)} onClick={r.run}>
                  <span className="pal-icon">{r.icon}</span>
                  <span className="pal-label">{r.label}</span>
                  {r.hint && <span className="pal-hint">{r.hint}</span>}
                  {idx === sel && <CornerDownLeft size={14} className="pal-enter" />}
                </button>
              );
            })}
          </div>
        ))}
        {!flat.length && <div className="pal-empty">No results for “{q}”</div>}
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useUI();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.undo && <button className="toast-undo" onClick={doUndo}>Undo</button>}
          <button className="icon-btn sm toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
