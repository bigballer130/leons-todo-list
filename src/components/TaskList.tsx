import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { addTask, getState, moveTask, useAppState } from '../store';
import type { Draft, SortBy, Task, TaskDefaults } from '../types';
import { setUI, toast } from '../ui';
import { DndContext, TaskItem, type DropMode } from './TaskItem';
import { TaskEditor } from './TaskEditor';

export function sortTasks(tasks: Task[], sort: SortBy): Task[] {
  const arr = [...tasks];
  const dueKey = (t: Task) => (t.due ? t.due.date + (t.due.time ?? '99:99') : '9999');
  switch (sort) {
    case 'date':
      arr.sort((a, b) => dueKey(a).localeCompare(dueKey(b)) || a.priority - b.priority || a.order - b.order);
      break;
    case 'priority':
      arr.sort((a, b) => a.priority - b.priority || dueKey(a).localeCompare(dueKey(b)) || a.order - b.order);
      break;
    case 'name':
      arr.sort((a, b) => a.content.localeCompare(b.content));
      break;
    case 'added':
      arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    default:
      arr.sort((a, b) => a.order - b.order);
  }
  // completed tasks sink to the bottom
  return arr.sort((a, b) => Number(a.completed) - Number(b.completed));
}

/** Sorting used by date-based views: time first, then priority. */
export function sortForDay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ta = a.due?.time ?? '99:99';
    const tb = b.due?.time ?? '99:99';
    return ta.localeCompare(tb) || a.priority - b.priority || a.order - b.order;
  });
}

export function draftFrom(defaults: TaskDefaults): Draft {
  const s = getState();
  return {
    content: '',
    description: '',
    due: defaults.due ?? null,
    deadline: null,
    duration: null,
    reminders: [],
    priority: defaults.priority ?? 4,
    labels: defaults.labels ?? [],
    projectId: defaults.projectId ?? s.projects.find((p) => p.isInbox)!.id,
    sectionId: defaults.sectionId ?? null,
    parentId: defaults.parentId ?? null,
  };
}

export function AddTaskButton({ onClick, label = 'Add task' }: { onClick: () => void; label?: string }) {
  return (
    <button className="add-task-btn" onClick={onClick}>
      <span className="plus"><Plus size={16} /></span>
      <span>{label}</span>
    </button>
  );
}

/** Inline "Add task" button that turns into an editor. */
export function InlineAdd({ defaults, label, onAdded }: { defaults: TaskDefaults; label?: string; onAdded?: (t: Task) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <AddTaskButton label={label} onClick={() => { setUI({ editingTaskId: null }); setOpen(true); }} />;
  return (
    <TaskEditor
      mode="add"
      keepOpen
      initial={draftFrom(defaults)}
      onCancel={() => setOpen(false)}
      onSubmit={(d) => {
        const t = addTask(d);
        onAdded?.(t);
        announceAdd(t, defaults);
      }}
    />
  );
}

/** Tell the user where a task went when it lands outside the current view. */
export function announceAdd(t: Task, defaults: TaskDefaults) {
  const s = getState();
  if (defaults.projectId && t.projectId !== defaults.projectId) {
    toast(`Task added to ${s.projects.find((p) => p.id === t.projectId)?.name}`);
  }
}

interface TaskTreeProps {
  tasks: Task[];
  sort: SortBy;
  /** Show the project name on each row */
  showProject?: boolean;
  /** Render nested sub-tasks (project views) vs. flat (date views) */
  tree?: boolean;
  hideDate?: boolean;
  defaults?: TaskDefaults;
  draggable?: boolean;
  /** rows can be dragged out (e.g. onto another day) but not reordered here */
  draggableFlat?: boolean;
  empty?: ReactNode;
}

/** Renders a list of tasks; in tree mode sub-tasks nest under their parent. */
export function TaskTree({ tasks, sort, showProject, tree = true, hideDate, defaults, draggable, draggableFlat, empty }: TaskTreeProps) {
  const s = useAppState();
  const [addAt, setAddAt] = useState<{ id: string; where: 'before' | 'after' } | null>(null);
  const ids = new Set(tasks.map((t) => t.id));
  const roots = tree ? tasks.filter((t) => !t.parentId || !ids.has(t.parentId)) : tasks;

  const onAddAt = defaults ? (id: string, where: 'before' | 'after') => setAddAt({ id, where }) : undefined;

  const renderAddAt = (t: Task, depth: number) => (
    <div style={{ marginLeft: depth * 28 }}>
      <TaskEditor
        mode="add"
        initial={{ ...draftFrom(defaults ?? {}), projectId: t.projectId, sectionId: t.sectionId, parentId: t.parentId }}
        onCancel={() => setAddAt(null)}
        onSubmit={(d) => {
          addTask(d, { [addAt!.where]: t.id });
          setAddAt(null);
        }}
      />
    </div>
  );

  const renderTask = (t: Task, depth: number): ReactNode => {
    const kids = tree ? sortTasks(tasks.filter((c) => c.parentId === t.id), sort) : [];
    const hasKids = tree ? s.tasks.some((c) => c.parentId === t.id && (ids.has(c.id))) : undefined;
    return (
      <div key={t.id} className="task-node">
        {addAt?.id === t.id && addAt.where === 'before' && renderAddAt(t, depth)}
        <TaskItem
          task={t}
          depth={depth}
          showProject={showProject}
          hasChildren={tree ? hasKids : undefined}
          hideDate={hideDate}
          draggable={(draggable && sort === 'manual') || draggableFlat}
          onAddAt={onAddAt}
        />
        {addAt?.id === t.id && addAt.where === 'after' && renderAddAt(t, depth)}
        {!t.collapsed && kids.map((k) => renderTask(k, depth + 1))}
      </div>
    );
  };

  return (
    <DndContext.Provider
      value={{
        allowNest: tree,
        onDropOnTask: draggable && sort === 'manual' ? (dragId: string, targetId: string, mode: DropMode) => moveTask(dragId, targetId, mode) : undefined,
      }}
    >
      <div className="task-list">
        {roots.length === 0 && empty}
        {sortTasks(roots, sort).map((t) => renderTask(t, 0))}
      </div>
    </DndContext.Provider>
  );
}
