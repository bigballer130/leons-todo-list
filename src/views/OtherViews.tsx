import { useMemo, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, Heart, HeartOff, LayoutTemplate, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Tag,
  Trash2,
} from 'lucide-react';
import { colorHex } from '../colors';
import { dayHeader, formatTime, pad, shortDate, toISO, todayISO, addDays, fromISO, WEEKDAYS_SHORT } from '../dates';
import { compileQuery } from '../query';
import {
  deleteFilter, deleteLabel, deleteTemplate, uncompleteTask, updateFilter, updateLabel, useAppState, clearCompletedLog,
} from '../store';
import type { Filter, Label, Task } from '../types';
import { confirm, navigate, openDialog, openTask, toast } from '../ui';
import { Menu, useAnchor } from '../components/Popover';
import { ProjectIcon } from '../components/Pickers';
import { InlineAdd, TaskTree } from '../components/TaskList';
import { renderInline } from '../components/TaskItem';
import { EmptyState, useLayoutOption, useViewOptions, ViewHeader, ViewOptionsButton } from './common';
import { CalendarLayout, TableLayout } from './Layouts';

export function LabelView({ label }: { label: Label }) {
  const s = useAppState();
  const key = `label:${label.id}`;
  const opts = useViewOptions(key);
  const tasks = s.tasks.filter((t) => t.labels.includes(label.name) && (opts.showCompleted || !t.completed));
  const [layout, setLayout] = useLayoutOption(key);
  return (
    <div className={`view ${layout !== 'list' ? 'wide-mode' : ''}`}>
      <ViewHeader
        title={label.name}
        icon={<Tag size={22} color={colorHex(label.color)} style={{ marginRight: 8 }} />}
        subtitle={`${tasks.filter((t) => !t.completed).length} tasks`}
        actions={
          <>
            <ViewOptionsButton viewKey={key} layout={layout} onLayout={setLayout} layouts={['list', 'calendar', 'table']} />
            <button className="header-btn icon-only" onClick={() => openDialog({ kind: 'label', id: label.id })} aria-label="Edit label">
              <Pencil size={16} />
            </button>
          </>
        }
      />
      {layout === 'calendar' ? (
        <CalendarLayout tasks={tasks} defaults={{ labels: [label.name] }} />
      ) : layout === 'table' ? (
        <TableLayout tasks={tasks} sort={opts.sort === 'manual' ? 'date' : opts.sort} viewKey={key} showProject />
      ) : (
        <TaskTree
          tasks={tasks}
          sort={opts.sort === 'manual' ? 'date' : opts.sort}
          tree={false}
          showProject
          empty={<EmptyState art="search" title="No tasks with this label" text={`Add @${label.name} to any task to see it here.`} />}
        />
      )}
      {layout !== 'calendar' && <InlineAdd defaults={{ labels: [label.name] }} />}
    </div>
  );
}

export function FilterView({ filter }: { filter: Filter }) {
  const s = useAppState();
  const key = `filter:${filter.id}`;
  const opts = useViewOptions(key);
  const fn = useMemo(() => compileQuery(filter.query), [filter.query]);
  const tasks = fn ? s.tasks.filter((t) => (opts.showCompleted || !t.completed) && fn(t, s)) : [];
  const [layout, setLayout] = useLayoutOption(key);
  return (
    <div className={`view ${layout !== 'list' ? 'wide-mode' : ''}`}>
      <ViewHeader
        title={filter.name}
        icon={<SlidersHorizontal size={22} color={colorHex(filter.color)} style={{ marginRight: 8 }} />}
        subtitle={<code className="query-chip">{filter.query}</code>}
        actions={
          <>
            <ViewOptionsButton viewKey={key} layout={layout} onLayout={setLayout} layouts={['list', 'calendar', 'table']} />
            <button className="header-btn icon-only" onClick={() => openDialog({ kind: 'filter', id: filter.id })} aria-label="Edit filter">
              <Pencil size={16} />
            </button>
          </>
        }
      />
      {!fn && <div className="notice">This filter query could not be understood. Edit it to fix it.</div>}
      {layout === 'calendar' ? (
        <CalendarLayout tasks={tasks} />
      ) : layout === 'table' ? (
        <TableLayout tasks={tasks} sort={opts.sort === 'manual' ? 'date' : opts.sort} viewKey={key} showProject />
      ) : (
        <TaskTree
          tasks={tasks}
          sort={opts.sort === 'manual' ? 'date' : opts.sort}
          tree={false}
          showProject
          empty={fn && <EmptyState art="search" title="No matching tasks" text="Tasks that match this filter will show up here." />}
        />
      )}
    </div>
  );
}

function ListRow({
  icon, name, count, favorite, onOpen, onEdit, onFavorite, onDelete,
}: {
  icon: React.ReactNode;
  name: string;
  count: number;
  favorite: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  const [a, open, close] = useAnchor();
  return (
    <div className="fl-row" onClick={onOpen}>
      {icon}
      <span className="grow">{name}</span>
      <span className="count">{count || ''}</span>
      <div className="fl-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn sm" onClick={onEdit} aria-label="Edit"><Pencil size={16} /></button>
        <button className="icon-btn sm" onClick={onFavorite} aria-label="Toggle favorite">
          {favorite ? <HeartOff size={16} /> : <Heart size={16} />}
        </button>
        <button className="icon-btn sm" onClick={(e) => open(e.currentTarget)} aria-label="More"><MoreHorizontal size={16} /></button>
      </div>
      {a && (
        <Menu
          anchor={a}
          onClose={close}
          align="end"
          items={[
            { label: 'Edit', icon: <Pencil size={16} />, onClick: onEdit },
            { label: favorite ? 'Remove from favorites' : 'Add to favorites', icon: <Heart size={16} />, onClick: onFavorite },
            { divider: true },
            { label: 'Delete', icon: <Trash2 size={16} />, danger: true, onClick: onDelete },
          ]}
        />
      )}
    </div>
  );
}

export function FiltersLabelsView() {
  const s = useAppState();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [labelsOpen, setLabelsOpen] = useState(true);
  const filters = [...s.filters].sort((a, b) => a.order - b.order);
  const labels = [...s.labels].sort((a, b) => a.order - b.order);
  return (
    <div className="view">
      <ViewHeader title="Filters & Labels" />
      <section className="fl-section">
        <div className="fl-head">
          <button className="collapse-btn" onClick={() => setFiltersOpen(!filtersOpen)}>
            {filtersOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <h3>Filters</h3>
          <button className="icon-btn sm" onClick={() => openDialog({ kind: 'filter' })} aria-label="Add filter"><Plus size={18} /></button>
        </div>
        {filtersOpen && (
          <div className="fl-list">
            {filters.map((f) => {
              const fn = compileQuery(f.query);
              const count = fn ? s.tasks.filter((t) => !t.completed && fn(t, s)).length : 0;
              return (
                <ListRow
                  key={f.id}
                  icon={<SlidersHorizontal size={18} color={colorHex(f.color)} />}
                  name={f.name}
                  count={count}
                  favorite={f.favorite}
                  onOpen={() => navigate({ kind: 'filter', id: f.id })}
                  onEdit={() => openDialog({ kind: 'filter', id: f.id })}
                  onFavorite={() => updateFilter(f.id, { favorite: !f.favorite })}
                  onDelete={() =>
                    confirm('Delete filter?', `The filter "${f.name}" will be deleted. Your tasks are not affected.`, () => {
                      deleteFilter(f.id);
                      toast('Filter deleted', { undo: true });
                    })
                  }
                />
              );
            })}
            {!filters.length && <p className="muted fl-empty">Filters show tasks that match a query — like “today & p1” or “@errands | #Home”.</p>}
          </div>
        )}
      </section>
      <section className="fl-section">
        <div className="fl-head">
          <button className="collapse-btn" onClick={() => setLabelsOpen(!labelsOpen)}>
            {labelsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <h3>Labels</h3>
          <button className="icon-btn sm" onClick={() => openDialog({ kind: 'label' })} aria-label="Add label"><Plus size={18} /></button>
        </div>
        {labelsOpen && (
          <div className="fl-list">
            {labels.map((l) => (
              <ListRow
                key={l.id}
                icon={<Tag size={18} color={colorHex(l.color)} />}
                name={l.name}
                count={s.tasks.filter((t) => !t.completed && t.labels.includes(l.name)).length}
                favorite={l.favorite}
                onOpen={() => navigate({ kind: 'label', id: l.id })}
                onEdit={() => openDialog({ kind: 'label', id: l.id })}
                onFavorite={() => updateLabel(l.id, { favorite: !l.favorite })}
                onDelete={() =>
                  confirm('Delete label?', `The label "${l.name}" will be removed from all tasks.`, () => {
                    deleteLabel(l.id);
                    toast('Label deleted', { undo: true });
                  })
                }
              />
            ))}
            {!labels.length && <p className="muted fl-empty">Labels let you tag tasks across projects. Type @name when adding a task.</p>}
          </div>
        )}
      </section>
      {s.templates.length > 0 && (
        <section className="fl-section">
          <div className="fl-head"><h3>Your templates</h3></div>
          <div className="fl-list">
            {s.templates.map((t) => (
              <div key={t.id} className="fl-row" onClick={() => openDialog({ kind: 'project' })}>
                <LayoutTemplate size={18} color={colorHex(t.color)} />
                <span className="grow">{t.name}</span>
                <span className="count">{t.tasks.length} tasks</span>
                <div className="fl-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn sm"
                    aria-label="Delete template"
                    onClick={() => confirm('Delete template?', `"${t.name}" will be removed. Projects made from it are not affected.`, () => deleteTemplate(t.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function CompletedView() {
  const s = useAppState();
  const [project, setProject] = useState<string>('all');
  const [pa, openP, closeP] = useAnchor();
  const entries = s.log.filter((l) => project === 'all' || l.projectId === project);
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const d = toISO(new Date(e.completedAt));
    groups.set(d, [...(groups.get(d) ?? []), e]);
  }

  // last 7 days chart
  const today = todayISO();
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const counts = week.map((d) => s.log.filter((l) => toISO(new Date(l.completedAt)) === d).length);
  const max = Math.max(s.settings.dailyGoal, ...counts, 1);
  const selected = project === 'all' ? null : s.projects.find((p) => p.id === project);

  return (
    <div className="view">
      <ViewHeader
        title="Completed"
        subtitle={`${s.log.length} task${s.log.length === 1 ? '' : 's'} completed in total`}
        actions={
          <>
            <button className="header-btn" onClick={(e) => openP(e.currentTarget)}>
              {selected ? <ProjectIcon project={selected} size={14} /> : null}
              {selected ? selected.name : 'All projects'} <ChevronDown size={14} />
            </button>
            {s.log.length > 0 && (
              <button
                className="header-btn icon-only"
                aria-label="Clear history"
                title="Clear history"
                onClick={() => confirm('Clear completed history?', 'The activity log will be cleared. Completed tasks stay completed.', clearCompletedLog, 'Clear')}
              >
                <Trash2 size={16} />
              </button>
            )}
          </>
        }
      />
      {pa && (
        <Menu
          anchor={pa}
          onClose={closeP}
          items={[
            { label: 'All projects', checked: project === 'all', onClick: () => setProject('all') },
            ...s.projects.filter((p) => !p.archived).map((p) => ({
              label: p.name, icon: <ProjectIcon project={p} />, checked: project === p.id, onClick: () => setProject(p.id),
            })),
          ]}
        />
      )}
      <div className="chart-card">
        <div className="chart-title">Last 7 days <span className="muted">· goal {s.settings.dailyGoal}/day</span></div>
        <div className="bar-chart">
          {week.map((d, i) => (
            <div key={d} className="bar-col" title={`${counts[i]} completed on ${shortDate(d)}`}>
              <div className="bar-track">
                <div className="goal-line" style={{ bottom: `${(s.settings.dailyGoal / max) * 100}%` }} />
                <div className={`bar ${counts[i] >= s.settings.dailyGoal ? 'met' : ''}`} style={{ height: `${(counts[i] / max) * 100}%` }} />
              </div>
              <span className="bar-val">{counts[i]}</span>
              <span className="bar-label">{d === today ? 'Today' : WEEKDAYS_SHORT[fromISO(d).getDay()]}</span>
            </div>
          ))}
        </div>
      </div>
      {entries.length === 0 && <EmptyState art="done" title="No completed tasks yet" text="Tasks you finish will be listed here, with when you finished them." />}
      {[...groups.entries()].map(([d, list]) => (
        <section key={d} className="day-group">
          <div className="day-header"><h3>{dayHeader(d)}</h3><span className="count">{list.length}</span></div>
          {list.map((e) => {
            const task = s.tasks.find((t) => t.id === e.taskId);
            const p = s.projects.find((x) => x.id === e.projectId);
            const dt = new Date(e.completedAt);
            return (
              <div key={e.id} className="log-row" onClick={() => task && openTask(task.id)}>
                <span className="log-check"><Check size={12} strokeWidth={3} /></span>
                <div className="grow">
                  <div className="log-content">{renderInline(e.content)}</div>
                  <div className="log-meta">
                    {formatTime(`${pad(dt.getHours())}:${pad(dt.getMinutes())}`)}
                    {p && <> · <ProjectIcon project={p} size={11} /> {p.name}</>}
                    {task?.due?.recurrence && ' · recurring'}
                  </div>
                </div>
                {task?.completed && (
                  <button
                    className="btn ghost sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      uncompleteTask(task.id);
                      toast('Task reopened', { undo: true });
                    }}
                  >
                    Reopen
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function searchTasks(tasks: Task[], q: string): Task[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return tasks.filter((t) => {
    const hay = `${t.content} ${t.description} ${t.labels.join(' ')} ${t.comments.map((c) => c.text).join(' ')}`.toLowerCase();
    return terms.every((x) => hay.includes(x));
  });
}

export function SearchView({ q }: { q: string }) {
  const s = useAppState();
  const results = searchTasks(s.tasks, q);
  const open = results.filter((t) => !t.completed);
  const done = results.filter((t) => t.completed);
  return (
    <div className="view">
      <ViewHeader title={`Search: ${q}`} subtitle={`${results.length} result${results.length === 1 ? '' : 's'}`} />
      <TaskTree tasks={open} sort="date" tree={false} showProject empty={<EmptyState art="search" title="No results" text="Try different words, or check the spelling." />} />
      {done.length > 0 && (
        <>
          <div className="day-header"><h3>Completed</h3><span className="count">{done.length}</span></div>
          <TaskTree tasks={done} sort="date" tree={false} showProject />
        </>
      )}
    </div>
  );
}
