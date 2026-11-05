import { useMemo, useState } from 'react';
import {
  Armchair, ArrowRight, Ban, Calendar, CalendarCheck, Check, ChevronLeft, ChevronRight, Circle, Clock,
  Flag, Hash, Inbox, Plus, Repeat, Search, Sun, Tag, X,
} from 'lucide-react';
import {
  addDays, daysInMonth, diffDays, dueInfo, fromISO, MONTHS, shortDate, startOfWeek, toISO, todayISO, weekday,
  WEEKDAYS, WEEKDAYS_SHORT,
} from '../dates';
import { parseDueText } from '../parser';
import { useAppState } from '../store';
import { colorHex, PRIORITY_COLORS } from '../colors';
import type { Due, Priority, Project, Recurrence } from '../types';
import { Menu, Popover, useAnchor } from './Popover';

// ---------------- Date picker ----------------

export function DatePicker({
  value, onChange, onClose, dateOnly,
}: { value: Due | null; onChange: (d: Due | null) => void; onClose: () => void; dateOnly?: boolean }) {
  const s = useAppState();
  const today = todayISO();
  const [text, setText] = useState('');
  const [month, setMonth] = useState(() => {
    const d = fromISO(value?.date ?? today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [timeAnchor, openTime, closeTime] = useAnchor();
  const [repeatAnchor, openRepeat, closeRepeat] = useAnchor();
  const parsedText = text.trim() ? parseDueText(text, s.settings.weekStart) : null;
  const typed = parsedText && dateOnly ? { date: parsedText.date } : parsedText;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of s.tasks) if (!t.completed && t.due) m.set(t.due.date, (m.get(t.due.date) ?? 0) + 1);
    return m;
  }, [s.tasks]);

  const set = (date: string | null) => {
    onChange(date ? { date, time: value?.time ?? null, recurrence: value?.recurrence ?? null } : null);
    onClose();
  };

  const wdToday = weekday(today);
  const weekendDay = wdToday === 6 ? addDays(today, 7) : wdToday === 0 ? addDays(today, 6) : addDays(today, 6 - wdToday);
  const nextWeek = addDays(startOfWeek(today, s.settings.weekStart), 7);
  const options = [
    { icon: <CalendarCheck size={18} color="var(--due-today)" />, label: 'Today', date: today },
    { icon: <Sun size={18} color="var(--due-tomorrow)" />, label: 'Tomorrow', date: addDays(today, 1) },
    ...(weekday(today) >= 1 && weekday(today) <= 3
      ? [{ icon: <ArrowRight size={18} color="var(--due-week)" />, label: 'Later this week', date: addDays(today, 2) }]
      : []),
    { icon: <Armchair size={18} color="var(--due-week)" />, label: 'This weekend', date: weekendDay },
    { icon: <Calendar size={18} color="var(--due-week)" />, label: 'Next week', date: nextWeek },
  ];

  // calendar grid
  const first = toISO(new Date(month.y, month.m, 1));
  const gridStart = startOfWeek(first, s.settings.weekStart);
  const dim = daysInMonth(month.y, month.m);
  const cellCount = Math.ceil((diffDays(first, gridStart) + dim) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => addDays(gridStart, i));
  const wdOrder = Array.from({ length: 7 }, (_, i) => (i + s.settings.weekStart) % 7);
  const shiftMonth = (n: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="date-picker">
      <div className="dp-input">
        <input
          autoFocus
          placeholder="Type a date, e.g. next fri 3pm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed) {
              e.preventDefault();
              onChange(typed);
              onClose();
            }
          }}
        />
        {value && !text && <div className="dp-current">{dueInfo(value).label}{value.recurrence ? ` · ${value.recurrence.text}` : ''}</div>}
        {typed && (
          <button className="dp-typed" onClick={() => { onChange(typed); onClose(); }}>
            <Calendar size={16} />
            <span>{WEEKDAYS[weekday(typed.date)]} {shortDate(typed.date)}{typed.time ? ` · ${dueInfo(typed).label.split(' ').slice(1).join(' ')}` : ''}</span>
            {typed.recurrence && <span className="dp-rec"><Repeat size={12} /> {typed.recurrence.text}</span>}
          </button>
        )}
        {text.trim() && !typed && <div className="dp-none">No date recognized</div>}
      </div>
      <div className="dp-options">
        {options.map((o) => (
          <button key={o.label} className="dp-option" onClick={() => set(o.date)}>
            {o.icon}
            <span>{o.label}</span>
            <span className="dp-hint">{o.label === 'Today' || o.label === 'Tomorrow' ? WEEKDAYS_SHORT[weekday(o.date)] : `${WEEKDAYS_SHORT[weekday(o.date)]} ${shortDate(o.date)}`}</span>
          </button>
        ))}
        {value && (
          <button className="dp-option" onClick={() => set(null)}>
            <Ban size={18} color="var(--text-3)" />
            <span>No date</span>
          </button>
        )}
      </div>
      <div className="dp-cal">
        <div className="dp-cal-head">
          <strong>{MONTHS[month.m]} {month.y}</strong>
          <div>
            <button className="icon-btn sm" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <button className="icon-btn sm" onClick={() => setMonth({ y: fromISO(today).getFullYear(), m: fromISO(today).getMonth() })} aria-label="This month"><Circle size={10} /></button>
            <button className="icon-btn sm" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="dp-grid">
          {wdOrder.map((d) => <span key={d} className="dp-wd">{WEEKDAYS_SHORT[d][0]}</span>)}
          {cells.map((d) => {
            const inMonth = fromISO(d).getMonth() === month.m;
            const cls = [
              'dp-day',
              inMonth ? '' : 'out',
              d < today ? 'past' : '',
              d === today ? 'today' : '',
              d === value?.date ? 'selected' : '',
            ].join(' ');
            return (
              <button key={d} className={cls} onClick={() => set(d)} title={shortDate(d)}>
                {fromISO(d).getDate()}
                {counts.get(d) ? <i className="dp-dot" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {!dateOnly && <div className="dp-footer">
        <button className={`chip ${value?.time ? 'active' : ''}`} onClick={(e) => openTime(e.currentTarget)}>
          <Clock size={14} /> {value?.time ? dueInfo({ date: today, time: value.time }).label.replace('Today ', '') : 'Time'}
        </button>
        <button className={`chip ${value?.recurrence ? 'active' : ''}`} onClick={(e) => openRepeat(e.currentTarget)}>
          <Repeat size={14} /> {value?.recurrence ? value.recurrence.text : 'Repeat'}
        </button>
      </div>}
      {timeAnchor && (
        <TimePopover
          anchor={timeAnchor}
          value={value?.time ?? null}
          onClose={closeTime}
          onChange={(time) => onChange({ date: value?.date ?? today, time, recurrence: value?.recurrence ?? null })}
        />
      )}
      {repeatAnchor && (
        <RepeatMenu
          anchor={repeatAnchor}
          date={value?.date ?? today}
          onClose={closeRepeat}
          onChange={(rec) => onChange({ date: value?.date ?? today, time: value?.time ?? null, recurrence: rec })}
        />
      )}
    </div>
  );
}

function TimePopover({
  anchor, value, onChange, onClose,
}: { anchor: HTMLElement; value: string | null; onChange: (t: string | null) => void; onClose: () => void }) {
  const [t, setT] = useState(value ?? '09:00');
  const presets = ['09:00', '12:00', '15:00', '18:00', '20:00'];
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <div className="time-pop">
        <label className="field-label">Time</label>
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} autoFocus />
        <div className="time-presets">
          {presets.map((p) => (
            <button key={p} className="chip" onClick={() => { onChange(p); onClose(); }}>
              {dueInfo({ date: todayISO(), time: p }).label.replace('Today ', '')}
            </button>
          ))}
        </div>
        <div className="row-end">
          {value && <button className="btn ghost" onClick={() => { onChange(null); onClose(); }}>Remove</button>}
          <button className="btn primary" onClick={() => { onChange(t); onClose(); }}>Save</button>
        </div>
      </div>
    </Popover>
  );
}

function RepeatMenu({
  anchor, date, onChange, onClose,
}: { anchor: HTMLElement; date: string; onChange: (r: Recurrence | null) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const d = fromISO(date);
  const wd = d.getDay();
  const day = d.getDate();
  const opts: Array<[string, Recurrence]> = [
    ['Every day', { freq: 'day', interval: 1, text: 'every day' }],
    [`Every week on ${WEEKDAYS[wd]}`, { freq: 'week', interval: 1, weekdays: [wd], text: `every ${WEEKDAYS_SHORT[wd].toLowerCase()}` }],
    ['Every weekday (Mon - Fri)', { freq: 'day', interval: 1, workdays: true, text: 'every workday' }],
    [`Every month on the ${day}${['th', 'st', 'nd', 'rd'][day % 10 > 3 || [11, 12, 13].includes(day) ? 0 : day % 10]}`, { freq: 'month', interval: 1, monthDay: day, text: `every month` }],
    [`Every year on ${MONTHS[d.getMonth()]} ${day}`, { freq: 'year', interval: 1, text: 'every year' }],
  ];
  const parsedCustom = custom.trim() ? parseDueText(custom.startsWith('every') ? custom : `every ${custom}`)?.recurrence : null;
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      width={280}
      items={[
        ...opts.map(([label, r]) => ({ label, icon: <Repeat size={16} />, onClick: () => onChange(r) })),
        { divider: true },
        {
          custom: (
            <div className="repeat-custom">
              <input
                placeholder='Custom, e.g. "every 2 weeks"'
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && parsedCustom) {
                    onChange(parsedCustom);
                    onClose();
                  }
                }}
              />
              {parsedCustom && <span className="dp-rec"><Repeat size={12} /> {parsedCustom.text} — press Enter</span>}
            </div>
          ),
        },
        { label: 'Does not repeat', icon: <X size={16} />, onClick: () => onChange(null) },
      ]}
    />
  );
}

export function DatePopover({
  anchor, value, onChange, onClose,
}: { anchor: HTMLElement; value: Due | null; onChange: (d: Due | null) => void; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={270}>
      <DatePicker value={value} onChange={onChange} onClose={onClose} />
    </Popover>
  );
}

// ---------------- Priority ----------------

export function PriorityFlag({ p, size = 16 }: { p: Priority; size?: number }) {
  return <Flag size={size} color={PRIORITY_COLORS[p]} fill={p < 4 ? PRIORITY_COLORS[p] : 'none'} />;
}

export function PriorityMenu({
  anchor, value, onChange, onClose,
}: { anchor: HTMLElement; value: Priority; onChange: (p: Priority) => void; onClose: () => void }) {
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      width={200}
      items={([1, 2, 3, 4] as Priority[]).map((p) => ({
        label: `Priority ${p}`,
        icon: <PriorityFlag p={p} />,
        checked: value === p,
        onClick: () => onChange(p),
      }))}
    />
  );
}

// ---------------- Labels ----------------

export function LabelPicker({
  anchor, value, onChange, onClose,
}: { anchor: HTMLElement; value: string[]; onChange: (l: string[]) => void; onClose: () => void }) {
  const s = useAppState();
  const [q, setQ] = useState('');
  const query = q.trim().replace(/^@/, '');
  const list = [...s.labels]
    .sort((a, b) => a.order - b.order)
    .filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));
  const exact = s.labels.some((l) => l.name.toLowerCase() === query.toLowerCase());
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((n) => n !== name) : [...value, name]);
  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div className="picker">
        <div className="picker-search">
          <input
            autoFocus
            placeholder="Type a label"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query) {
                e.preventDefault();
                const match = list[0];
                if (match && match.name.toLowerCase() === query.toLowerCase()) toggle(match.name);
                else if (!exact) toggle(query.replace(/\s+/g, '_'));
                setQ('');
              }
            }}
          />
        </div>
        <div className="picker-list">
          {list.map((l) => (
            <button key={l.id} className="picker-item" onClick={() => toggle(l.name)}>
              <Tag size={16} color={colorHex(l.color)} />
              <span className="grow">{l.name}</span>
              <span className={`checkbox ${value.includes(l.name) ? 'on' : ''}`}>{value.includes(l.name) && <Check size={12} />}</span>
            </button>
          ))}
          {value
            .filter((n) => !s.labels.some((l) => l.name === n))
            .map((n) => (
              <button key={n} className="picker-item" onClick={() => toggle(n)}>
                <Tag size={16} />
                <span className="grow">{n} <em className="muted">(new)</em></span>
                <span className="checkbox on"><Check size={12} /></span>
              </button>
            ))}
          {query && !exact && (
            <button className="picker-item" onClick={() => { toggle(query.replace(/\s+/g, '_')); setQ(''); }}>
              <Plus size={16} />
              <span className="grow">Create label "{query.replace(/\s+/g, '_')}"</span>
            </button>
          )}
          {!list.length && !query && <div className="picker-empty">No labels yet. Type to create one.</div>}
        </div>
      </div>
    </Popover>
  );
}

// ---------------- Projects ----------------

export function ProjectIcon({ project, size = 16 }: { project: Project; size?: number }) {
  if (project.isInbox) return <Inbox size={size} color="var(--accent)" />;
  return <Hash size={size} color={colorHex(project.color)} />;
}

export function orderedProjects(projects: Project[]): Array<{ p: Project; depth: number }> {
  const out: Array<{ p: Project; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    projects
      .filter((p) => p.parentId === parent && !p.isInbox && !p.archived)
      .sort((a, b) => a.order - b.order)
      .forEach((p) => {
        out.push({ p, depth });
        walk(p.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}

export function ProjectPicker({
  anchor, projectId, sectionId, onChange, onClose,
}: {
  anchor: HTMLElement;
  projectId: string;
  sectionId: string | null;
  onChange: (projectId: string, sectionId: string | null) => void;
  onClose: () => void;
}) {
  const s = useAppState();
  const [q, setQ] = useState('');
  const inbox = s.projects.find((p) => p.isInbox)!;
  const rows: Array<{ p: Project; depth: number; section?: { id: string; name: string } }> = [];
  for (const r of [{ p: inbox, depth: 0 }, ...orderedProjects(s.projects)]) {
    rows.push(r);
    s.sections
      .filter((x) => x.projectId === r.p.id)
      .sort((a, b) => a.order - b.order)
      .forEach((x) => rows.push({ p: r.p, depth: r.depth + 1, section: { id: x.id, name: x.name } }));
  }
  const ql = q.toLowerCase();
  const filtered = ql
    ? rows.filter((r) => (r.section ? `${r.p.name} ${r.section.name}` : r.p.name).toLowerCase().includes(ql))
    : rows;
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <div className="picker">
        <div className="picker-search">
          <Search size={14} />
          <input
            autoFocus
            placeholder="Type a project name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                e.preventDefault();
                onChange(filtered[0].p.id, filtered[0].section?.id ?? null);
                onClose();
              }
            }}
          />
        </div>
        <div className="picker-list">
          {filtered.map((r) => {
            const selected = r.section ? sectionId === r.section.id : projectId === r.p.id && !sectionId;
            return (
              <button
                key={r.p.id + (r.section?.id ?? '')}
                className="picker-item"
                style={{ paddingLeft: 10 + r.depth * 16 }}
                onClick={() => {
                  onChange(r.p.id, r.section?.id ?? null);
                  onClose();
                }}
              >
                {r.section ? <span className="section-glyph" /> : <ProjectIcon project={r.p} />}
                <span className="grow">{r.section ? r.section.name : r.p.name}</span>
                {selected && <Check size={16} color="var(--accent)" />}
              </button>
            );
          })}
          {!filtered.length && <div className="picker-empty">No matching projects</div>}
        </div>
      </div>
    </Popover>
  );
}
