import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Tag } from 'lucide-react';
import { colorHex, PRIORITY_COLORS } from '../colors';
import {
  addDays, deadlineInfo, diffDays, dueInfo, endTime, formatDuration, formatTime, fromISO, MONTHS, shortDate,
  startOfWeek, toISO, todayISO, WEEKDAYS_SHORT,
} from '../dates';
import { setViewOptions, updateTask, useAppState, getState } from '../store';
import type { SortBy, Task, TaskDefaults } from '../types';
import { openQuickAdd, openTask } from '../ui';
import { DatePopover, LabelPicker, PriorityFlag, PriorityMenu, ProjectIcon } from '../components/Pickers';
import { DeadlinePopover, DurationPopover } from '../components/ExtraPickers';
import { useAnchor } from '../components/Popover';
import { Checkbox, drag, renderInline, toggleComplete } from '../components/TaskItem';
import { sortTasks } from '../components/TaskList';

// ---------------- Calendar ----------------

function CalendarChip({ task }: { task: Task }) {
  return (
    <div
      className={`cal-chip ${task.completed ? 'done' : ''}`}
      style={{ '--pc': PRIORITY_COLORS[task.priority] } as React.CSSProperties}
      draggable={!task.completed}
      onDragStart={(e) => {
        drag.id = task.id;
        drag.kind = 'task';
        e.dataTransfer.setData('text/plain', task.content);
      }}
      onDragEnd={() => {
        drag.id = null;
        drag.kind = null;
      }}
      onClick={(e) => {
        e.stopPropagation();
        openTask(task.id);
      }}
      title={task.content}
    >
      <Checkbox task={task} onToggle={() => toggleComplete(task)} />
      <span className="cal-chip-text">
        {task.due?.time && <span className="cal-time">{formatTime(task.due.time).replace(':00', '')}</span>}
        {renderInline(task.content)}
      </span>
    </div>
  );
}

function DayCell({
  day, tasks, deadlines, inMonth, defaults, full,
}: { day: string; tasks: Task[]; deadlines: Task[]; inMonth: boolean; defaults: TaskDefaults; full?: boolean }) {
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const today = todayISO();
  const limit = full || expanded ? Infinity : 3;
  const sorted = [...tasks].sort((a, b) => (a.due?.time ?? '99').localeCompare(b.due?.time ?? '99') || a.priority - b.priority);
  return (
    <div
      className={`cal-cell ${inMonth ? '' : 'out'} ${day === today ? 'today' : ''} ${day < today ? 'past' : ''} ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        if (drag.kind === 'task') {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const t = getState().tasks.find((x) => x.id === drag.id);
        if (t) updateTask(t.id, { due: { date: day, time: t.due?.time ?? null, recurrence: t.due?.recurrence ?? null } });
      }}
    >
      <div className="cal-day-head">
        <span className="cal-day-num">{full ? `${WEEKDAYS_SHORT[fromISO(day).getDay()]} ${fromISO(day).getDate()}` : fromISO(day).getDate()}</span>
        <button className="cal-add" aria-label={`Add task on ${shortDate(day)}`} onClick={() => openQuickAdd({ ...defaults, due: { date: day } })}>
          <Plus size={14} />
        </button>
      </div>
      {deadlines.map((t) => (
        <div key={'d' + t.id} className="cal-deadline" onClick={() => openTask(t.id)} title={`Deadline: ${t.content}`}>
          ⚑ {t.content}
        </div>
      ))}
      {sorted.slice(0, limit).map((t) => (
        <div key={t.id}>
          <CalendarChip task={t} />
          {full && t.due?.time && t.duration ? <div className="cal-dur">until {endTime(t.due.time, t.duration)}</div> : null}
        </div>
      ))}
      {sorted.length > limit && (
        <button className="cal-more" onClick={() => setExpanded(true)}>+{sorted.length - limit} more</button>
      )}
    </div>
  );
}

export function CalendarLayout({ tasks, defaults = {} }: { tasks: Task[]; defaults?: TaskDefaults }) {
  const s = useAppState();
  const ws = s.settings.weekStart;
  const today = todayISO();
  const [mode, setMode] = useState<'month' | 'week'>(() => (window.innerWidth < 768 ? 'week' : 'month'));
  const [anchor, setAnchor] = useState(today);

  const a = fromISO(anchor);
  let days: string[];
  let title: string;
  if (mode === 'month') {
    const first = toISO(new Date(a.getFullYear(), a.getMonth(), 1));
    const start = startOfWeek(first, ws);
    const dim = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    const count = Math.ceil((diffDays(first, start) + dim) / 7) * 7;
    days = Array.from({ length: count }, (_, i) => addDays(start, i));
    title = `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  } else {
    const start = startOfWeek(anchor, ws);
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    title = `${shortDate(days[0])} – ${shortDate(days[6])}`;
  }
  const shift = (n: number) => {
    if (mode === 'week') return setAnchor(addDays(anchor, 7 * n));
    setAnchor(toISO(new Date(a.getFullYear(), a.getMonth() + n, 1)));
  };
  const byDay = new Map<string, Task[]>();
  const deadlines = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.due) byDay.set(t.due.date, [...(byDay.get(t.due.date) ?? []), t]);
    if (t.deadline && !t.completed) deadlines.set(t.deadline, [...(deadlines.get(t.deadline) ?? []), t]);
  }
  const undated = tasks.filter((t) => !t.due && !t.completed).length;

  return (
    <div className={`calendar cal-${mode}`}>
      <div className="cal-toolbar">
        <strong className="cal-title">{title}</strong>
        <div className="row">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button className="btn outline sm" onClick={() => setAnchor(today)}>Today</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Next"><ChevronRight size={18} /></button>
          <div className="segmented sm">
            <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Month</button>
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Week</button>
          </div>
        </div>
      </div>
      {mode === 'month' && (
        <div className="cal-weekdays">
          {Array.from({ length: 7 }, (_, i) => <span key={i}>{WEEKDAYS_SHORT[(i + ws) % 7]}</span>)}
        </div>
      )}
      <div className="cal-grid">
        {days.map((d) => (
          <DayCell
            key={d}
            day={d}
            tasks={byDay.get(d) ?? []}
            deadlines={deadlines.get(d) ?? []}
            inMonth={mode === 'week' || fromISO(d).getMonth() === a.getMonth()}
            defaults={defaults}
            full={mode === 'week'}
          />
        ))}
      </div>
      {undated > 0 && <p className="muted small cal-undated">{undated} task{undated === 1 ? '' : 's'} without a date aren’t shown in the calendar.</p>}
    </div>
  );
}

// ---------------- Table ----------------

const COLS: Array<{ key: string; label: string; sort?: SortBy }> = [
  { key: 'task', label: 'Task', sort: 'name' },
  { key: 'due', label: 'Date', sort: 'date' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'priority', label: 'Priority', sort: 'priority' },
  { key: 'labels', label: 'Labels' },
  { key: 'duration', label: 'Duration' },
  { key: 'where', label: 'Project' },
];

function TableRow({ task, depth, showProject }: { task: Task; depth: number; showProject: boolean }) {
  const s = useAppState();
  const [dateA, openDate, closeDate] = useAnchor();
  const [deadA, openDead, closeDead] = useAnchor();
  const [prioA, openPrio, closePrio] = useAnchor();
  const [labelA, openLabel, closeLabel] = useAnchor();
  const [durA, openDur, closeDur] = useAnchor();
  const project = s.projects.find((p) => p.id === task.projectId);
  const section = s.sections.find((x) => x.id === task.sectionId);
  const due = task.due ? dueInfo(task.due) : null;
  const cell = (fn: (el: HTMLElement) => void) => (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!task.completed) fn(e.currentTarget);
  };
  return (
    <tr className={task.completed ? 'completed' : ''} data-task-id={task.id} onClick={() => openTask(task.id)}>
      <td className="tc-task">
        <div style={{ paddingLeft: depth * 22 }} className="tc-task-inner">
          <Checkbox task={task} onToggle={() => toggleComplete(task)} />
          <span className="tc-content">{renderInline(task.content)}</span>
        </div>
      </td>
      <td onClick={cell(openDate)} className={due ? `due-${due.tone}` : 'muted'}>{due?.label ?? '—'}</td>
      <td onClick={cell(openDead)} className={task.deadline ? `deadline-${deadlineInfo(task.deadline).tone}` : 'muted'}>
        {task.deadline ? deadlineInfo(task.deadline).label : '—'}
      </td>
      <td onClick={cell(openPrio)}><span className="tc-prio"><PriorityFlag p={task.priority} size={14} /> P{task.priority}</span></td>
      <td onClick={cell(openLabel)}>
        {task.labels.length ? (
          <span className="tc-labels">
            {task.labels.map((n) => (
              <span key={n} className="label-pill" style={{ '--lc': colorHex(s.labels.find((l) => l.name === n)?.color ?? 'grey') } as React.CSSProperties}>{n}</span>
            ))}
          </span>
        ) : <span className="muted"><Tag size={12} /></span>}
      </td>
      <td onClick={cell(openDur)} className={task.duration ? '' : 'muted'}>{task.duration ? formatDuration(task.duration) : '—'}</td>
      <td className="muted">
        {showProject && project ? <span className="tc-where"><ProjectIcon project={project} size={12} /> {project.name}{section ? ` / ${section.name}` : ''}</span> : section?.name ?? ''}
      </td>
      {dateA && <DatePopover anchor={dateA} value={task.due} onClose={closeDate} onChange={(d) => updateTask(task.id, { due: d })} />}
      {deadA && <DeadlinePopover anchor={deadA} value={task.deadline} onClose={closeDead} onChange={(d) => updateTask(task.id, { deadline: d })} />}
      {prioA && <PriorityMenu anchor={prioA} value={task.priority} onClose={closePrio} onChange={(p) => updateTask(task.id, { priority: p })} />}
      {labelA && <LabelPicker anchor={labelA} value={task.labels} onClose={closeLabel} onChange={(l) => updateTask(task.id, { labels: l })} />}
      {durA && <DurationPopover anchor={durA} value={task.duration} onClose={closeDur} onChange={(d) => updateTask(task.id, { duration: d })} />}
    </tr>
  );
}

export function TableLayout({
  tasks, sort, viewKey, showProject = false, tree = false,
}: { tasks: Task[]; sort: SortBy; viewKey: string; showProject?: boolean; tree?: boolean }) {
  const ids = new Set(tasks.map((t) => t.id));
  const rows: Array<{ t: Task; depth: number }> = [];
  const add = (t: Task, depth: number) => {
    rows.push({ t, depth });
    if (tree) sortTasks(tasks.filter((c) => c.parentId === t.id), sort).forEach((c) => add(c, depth + 1));
  };
  sortTasks(tree ? tasks.filter((t) => !t.parentId || !ids.has(t.parentId)) : tasks, sort).forEach((t) => add(t, 0));
  return (
    <div className="table-wrap">
      <table className="task-table">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={c.sort ? 'sortable' : ''}
                onClick={() => c.sort && setViewOptions(viewKey, { sort: sort === c.sort ? 'manual' : c.sort })}
              >
                {c.key === 'where' && !showProject ? 'Section' : c.label}
                {c.sort && sort === c.sort ? ' ↓' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, depth }) => <TableRow key={t.id} task={t} depth={depth} showProject={showProject} />)}
          {!rows.length && (
            <tr><td colSpan={COLS.length} className="muted tc-empty">No tasks</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
