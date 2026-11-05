import { useState, type ReactNode } from 'react';
import { ArrowDownUp, CalendarDays, Check, Columns3, Eye, List, SlidersHorizontal, Table2 } from 'lucide-react';
import { DEFAULT_VIEW_OPTIONS, setViewOptions, useAppState } from '../store';
import type { Layout, SortBy, ViewOptions } from '../types';
import { Popover, useAnchor } from '../components/Popover';

/** Layout picker wiring for views whose layout lives in view options (not on a project). */
export function useLayoutOption(key: string, fallback: Layout = 'list') {
  const opts = useViewOptions(key);
  return [opts.layout ?? fallback, (l: Layout) => setViewOptions(key, { layout: l })] as const;
}

export function useViewOptions(key: string): ViewOptions {
  const s = useAppState();
  return { ...DEFAULT_VIEW_OPTIONS, ...s.viewOptions[key] };
}

const SORTS: Array<[SortBy, string]> = [
  ['manual', 'Manual'],
  ['date', 'Date'],
  ['priority', 'Priority'],
  ['name', 'Name'],
  ['added', 'Date added'],
];

const LAYOUT_INFO: Record<Layout, { label: string; icon: ReactNode }> = {
  list: { label: 'List', icon: <List size={18} /> },
  board: { label: 'Board', icon: <Columns3 size={18} /> },
  calendar: { label: 'Calendar', icon: <CalendarDays size={18} /> },
  table: { label: 'Table', icon: <Table2 size={18} /> },
};

export function ViewOptionsButton({
  viewKey, layout, onLayout, layouts = ['list', 'board', 'calendar', 'table'], sortable = true, completedToggle = true,
}: {
  viewKey: string;
  layout?: Layout;
  onLayout?: (l: Layout) => void;
  layouts?: Layout[];
  sortable?: boolean;
  completedToggle?: boolean;
}) {
  const [a, open, close] = useAnchor();
  const opts = useViewOptions(viewKey);
  return (
    <>
      <button className="header-btn" onClick={(e) => open(e.currentTarget)}>
        <SlidersHorizontal size={16} /> <span className="hide-mobile">View</span>
      </button>
      {a && (
        <Popover anchor={a} onClose={close} width={280} align="end">
          <div className="view-options">
            {onLayout && (
              <>
                <div className="vo-title">Layout</div>
                <div className="segmented layouts">
                  {layouts.map((l) => (
                    <button key={l} className={layout === l ? 'on' : ''} onClick={() => onLayout(l)}>
                      {LAYOUT_INFO[l].icon} {LAYOUT_INFO[l].label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {completedToggle && (
              <label className="vo-row">
                <Eye size={16} />
                <span className="grow">Show completed tasks</span>
                <Toggle on={opts.showCompleted} onChange={(v) => setViewOptions(viewKey, { showCompleted: v })} />
              </label>
            )}
            {sortable && (
              <>
                <div className="vo-title">
                  <ArrowDownUp size={14} /> Sort by
                </div>
                <div className="vo-sorts">
                  {SORTS.map(([k, label]) => (
                    <button key={k} className={`vo-sort ${opts.sort === k ? 'on' : ''}`} onClick={() => setViewOptions(viewKey, { sort: k })}>
                      {label}
                      {opts.sort === k && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        onChange(!on);
      }}
    >
      <span />
    </button>
  );
}

export function ViewHeader({
  title, subtitle, actions, icon, onTitleEdit,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  onTitleEdit?: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  return (
    <header className="view-header">
      <div className="view-title-row">
        {editing && onTitleEdit ? (
          <input
            className="title-input"
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              if (val.trim()) onTitleEdit(val.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                (e.nativeEvent as Event & { _handled?: boolean })._handled = true;
                setEditing(false);
              }
            }}
          />
        ) : (
          <h1
            className={onTitleEdit ? 'editable' : ''}
            onClick={() => {
              if (onTitleEdit && typeof title === 'string') {
                setVal(title);
                setEditing(true);
              }
            }}
          >
            {icon}
            {title}
          </h1>
        )}
        <div className="view-actions">{actions}</div>
      </div>
      {subtitle && <div className="view-subtitle">{subtitle}</div>}
    </header>
  );
}

export function EmptyState({ title, text, art = 'done' }: { title: string; text?: string; art?: 'done' | 'inbox' | 'search' | 'calendar' }) {
  return (
    <div className="empty-state">
      <EmptyArt kind={art} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}

/** Original line illustrations for empty states. */
function EmptyArt({ kind }: { kind: 'done' | 'inbox' | 'search' | 'calendar' }) {
  const stroke = 'var(--text-3)';
  const accent = 'var(--accent)';
  return (
    <svg width="180" height="120" viewBox="0 0 180 120" fill="none" aria-hidden>
      <ellipse cx="90" cy="108" rx="62" ry="6" fill="var(--bg-hover)" />
      {kind === 'done' && (
        <>
          <circle cx="90" cy="56" r="38" fill="var(--accent-soft)" />
          <path d="M72 57l12 12 24-26" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="40" cy="30" r="4" fill={accent} opacity=".5" />
          <circle cx="142" cy="24" r="3" fill={accent} opacity=".6" />
          <path d="M146 70l6-6M150 76h8M34 72l-6-4" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {kind === 'inbox' && (
        <>
          <rect x="48" y="30" width="84" height="64" rx="10" fill="var(--bg)" stroke={stroke} strokeWidth="2.5" />
          <path d="M48 66h22l6 10h28l6-10h22" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M78 48h24M84 56h12" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === 'search' && (
        <>
          <circle cx="82" cy="52" r="26" fill="var(--accent-soft)" stroke={stroke} strokeWidth="2.5" />
          <path d="M101 71l22 22" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
          <path d="M72 46c3-6 9-9 15-8" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === 'calendar' && (
        <>
          <rect x="52" y="28" width="76" height="68" rx="10" fill="var(--bg)" stroke={stroke} strokeWidth="2.5" />
          <path d="M52 46h76" stroke={stroke} strokeWidth="2.5" />
          <path d="M72 22v12M108 22v12" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <rect x="66" y="56" width="14" height="12" rx="3" fill={accent} />
          <rect x="86" y="56" width="14" height="12" rx="3" fill="var(--bg-hover)" />
          <rect x="66" y="74" width="14" height="12" rx="3" fill="var(--bg-hover)" />
        </>
      )}
    </svg>
  );
}
