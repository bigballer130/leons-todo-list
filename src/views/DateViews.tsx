import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import {
  addDays, dayHeader, diffDays, fromISO, MONTHS, startOfWeek, todayISO, WEEKDAYS_SHORT,
} from '../dates';
import { getState, updateTask, useAppState } from '../store';
import type { Task } from '../types';
import { toast } from '../ui';
import { DatePopover } from '../components/Pickers';
import { useAnchor } from '../components/Popover';
import { drag } from '../components/TaskItem';
import { InlineAdd, sortForDay, sortTasks, TaskTree } from '../components/TaskList';
import { EmptyState, useLayoutOption, useViewOptions, ViewHeader, ViewOptionsButton } from './common';
import { CalendarLayout, TableLayout } from './Layouts';

function OverdueGroup({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(true);
  const [a, openPicker, close] = useAnchor();
  if (!tasks.length) return null;
  return (
    <section className="day-group overdue">
      <div className="day-header">
        <button className="collapse-btn" onClick={() => setOpen(!open)} aria-label="Toggle overdue">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <h3>Overdue</h3>
        <span className="count">{tasks.length}</span>
        <button className="link-btn" onClick={(e) => openPicker(e.currentTarget)}>
          <CalendarClock size={14} /> Reschedule
        </button>
      </div>
      {open && <TaskTree tasks={sortTasks(tasks, 'date')} sort="date" tree={false} showProject />}
      {a && (
        <DatePopover
          anchor={a}
          value={null}
          onClose={close}
          onChange={(d) => {
            if (!d) return;
            tasks.forEach((t) => updateTask(t.id, { due: { ...d, time: d.time ?? t.due?.time ?? null, recurrence: t.due?.recurrence ?? d.recurrence ?? null } }));
            toast(`${tasks.length} task${tasks.length === 1 ? '' : 's'} rescheduled`, { undo: true });
          }}
        />
      )}
    </section>
  );
}

export function TodayView() {
  const s = useAppState();
  const today = todayISO();
  const opts = useViewOptions('today');
  const [layout, setLayout] = useLayoutOption('today');
  const overdue = s.tasks.filter((t) => !t.completed && t.due && t.due.date < today);
  const todays = s.tasks.filter((t) => t.due?.date === today && (!t.completed || opts.showCompleted));
  const doneToday = s.log.filter((l) => l.completedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const total = overdue.length + todays.filter((t) => !t.completed).length;
  const sorted = opts.sort === 'manual' ? sortForDay(todays) : sortTasks(todays, opts.sort);

  return (
    <div className="view">
      <ViewHeader
        title="Today"
        subtitle={total ? `${total} task${total === 1 ? '' : 's'}` : undefined}
        actions={<ViewOptionsButton viewKey="today" layout={layout} onLayout={setLayout} layouts={['list', 'table']} />}
      />
      {layout === 'table' ? (
        <>
          <TableLayout tasks={[...overdue, ...todays]} sort={opts.sort === 'manual' ? 'date' : opts.sort} viewKey="today" showProject />
          <InlineAdd defaults={{ due: { date: today } }} />
        </>
      ) : (<>
      <OverdueGroup tasks={overdue} />
      <section className="day-group">
        {overdue.length > 0 && (
          <div className="day-header">
            <h3>{dayHeader(today)}</h3>
          </div>
        )}
        <TaskTree tasks={sorted} sort={opts.sort === 'manual' ? 'date' : opts.sort} tree={false} showProject hideDate />
        <InlineAdd defaults={{ due: { date: today } }} />
      </section>
      </>)}
      {total === 0 && (
        <EmptyState
          art="done"
          title={doneToday ? 'All clear for today' : 'A fresh, open day'}
          text={
            doneToday
              ? `You finished ${doneToday} task${doneToday === 1 ? '' : 's'} today. Nice work — enjoy the rest of your day.`
              : 'Nothing is scheduled for today. Add something above, or take it easy.'
          }
        />
      )}
    </div>
  );
}

export function UpcomingView() {
  const [layout, setLayout] = useLayoutOption('upcoming');
  const s = useAppState();
  const options = <ViewOptionsButton viewKey="upcoming" layout={layout} onLayout={setLayout} layouts={['list', 'calendar']} sortable={false} completedToggle={false} />;
  if (layout === 'calendar') {
    return (
      <div className="view wide-mode">
        <ViewHeader title="Upcoming" actions={options} />
        <CalendarLayout tasks={s.tasks.filter((t) => !t.completed && (t.due || t.deadline))} />
      </div>
    );
  }
  return <UpcomingList options={options} />;
}

function UpcomingList({ options }: { options: React.ReactNode }) {
  const s = useAppState();
  const today = todayISO();
  const ws = s.settings.weekStart;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, ws));
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dateA, openDate, closeDate] = useAnchor();

  const days = useMemo(() => {
    const start = weekStart < today ? today : weekStart;
    return Array.from({ length: Math.max(28, diffDays(addDays(weekStart, 28), start)) }, (_, i) => addDays(start, i));
  }, [weekStart, today]);

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of s.tasks) if (!t.completed && t.due && t.due.date >= today) {
      m.set(t.due.date, [...(m.get(t.due.date) ?? []), t]);
    }
    return m;
  }, [s.tasks, today]);
  const overdue = s.tasks.filter((t) => !t.completed && t.due && t.due.date < today);

  useEffect(() => {
    if (!focusDay) return;
    const el = listRef.current?.querySelector(`[data-day="${focusDay}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFocusDay(null);
  }, [focusDay]);

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const monthLabel = (() => {
    const d = fromISO(weekStart);
    const e = fromISO(addDays(weekStart, 6));
    return d.getMonth() === e.getMonth()
      ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      : `${MONTHS[d.getMonth()].slice(0, 3)} – ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
  })();

  return (
    <div className="view upcoming-view">
      <ViewHeader title="Upcoming" actions={options} />
      <div className="week-nav">
        <button className="month-btn" onClick={(e) => openDate(e.currentTarget)}>
          {monthLabel} <ChevronDown size={14} />
        </button>
        <div className="week-nav-btns">
          <button
            className="icon-btn"
            disabled={weekStart <= startOfWeek(today, ws)}
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="btn outline sm"
            onClick={() => {
              setWeekStart(startOfWeek(today, ws));
              setFocusDay(today);
            }}
          >
            Today
          </button>
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="week-strip">
        {week.map((d) => (
          <button
            key={d}
            className={`week-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}
            disabled={d < today}
            onClick={() => setFocusDay(d)}
          >
            <span>{WEEKDAYS_SHORT[fromISO(d).getDay()]}</span>
            <strong>{fromISO(d).getDate()}</strong>
            {byDay.get(d)?.length ? <i className="dp-dot" /> : <i className="dp-dot hidden" />}
          </button>
        ))}
      </div>
      {dateA && (
        <DatePopover
          anchor={dateA}
          value={null}
          onClose={closeDate}
          onChange={(d) => {
            if (d) {
              setWeekStart(startOfWeek(d.date < today ? today : d.date, ws));
              setFocusDay(d.date < today ? today : d.date);
            }
          }}
        />
      )}
      <div className="upcoming-list" ref={listRef}>
        {weekStart <= today && <OverdueGroup tasks={overdue} />}
        {days.map((d) => (
          <DayGroup key={d} day={d} tasks={sortForDay(byDay.get(d) ?? [])} />
        ))}
        <button className="btn ghost load-more" onClick={() => setWeekStart(addDays(weekStart, 28))}>
          <ChevronUp size={14} style={{ transform: 'rotate(180deg)' }} /> Show later weeks
        </button>
      </div>
    </div>
  );
}

function DayGroup({ day, tasks }: { day: string; tasks: Task[] }) {
  const [over, setOver] = useState(false);
  return (
    <section
      className={`day-group ${over ? 'drop-over' : ''}`}
      data-day={day}
      onDragOver={(e) => {
        if (drag.kind === 'task') {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (drag.kind === 'task' && drag.id) {
          const t = getState().tasks.find((x) => x.id === drag.id);
          if (t) updateTask(t.id, { due: { date: day, time: t.due?.time ?? null, recurrence: t.due?.recurrence ?? null } });
        }
      }}
    >
      <div className="day-header">
        <h3>{dayHeader(day)}</h3>
        {tasks.length > 0 && <span className="count">{tasks.length}</span>}
      </div>
      <DraggableFlatList tasks={tasks} />
      <InlineAdd defaults={{ due: { date: day } }} />
    </section>
  );
}

/** Flat list where rows can be dragged to other day groups. */
function DraggableFlatList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="draggable-flat">
      <TaskTree tasks={tasks} sort="date" tree={false} showProject hideDate draggableFlat />
    </div>
  );
}
