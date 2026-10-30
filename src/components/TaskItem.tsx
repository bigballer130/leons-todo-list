import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRightToLine, ArrowUpToLine, Armchair, Ban, Calendar, CalendarCheck, Check, ChevronDown,
  ChevronRight, Copy, CornerDownRight, CornerUpLeft, GitBranch, GripVertical, Link2, MessageSquare, MoreHorizontal,
  Pencil, Repeat, Sun, Tag, Trash2,
} from 'lucide-react';
import { addDays, dueInfo, startOfWeek, todayISO, weekday } from '../dates';
import {
  completeTask, deleteTask, duplicateTask, getState, indentTask, outdentTask, uncompleteTask, updateTask, useAppState,
} from '../store';
import { colorHex, PRIORITY_COLORS } from '../colors';
import type { Draft, Priority, Task } from '../types';
import { confirm, openTask, setUI, toast, useUI } from '../ui';
import { DatePopover, PriorityFlag, ProjectIcon, ProjectPicker } from './Pickers';
import { Menu, useAnchor } from './Popover';
import { TaskEditor } from './TaskEditor';

// ---------- inline markdown ----------

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] || m[4]) out.push(<strong key={k++}>{m[2] ?? m[4]}</strong>);
    else if (m[6] || m[8]) out.push(<em key={k++}>{m[6] ?? m[8]}</em>);
    else if (m[10]) out.push(<code key={k++}>{m[10]}</code>);
    else if (m[12]) out.push(<a key={k++} href={m[13]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{m[12]}</a>);
    else if (m[14]) out.push(<a key={k++} href={m[14]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{m[14]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------- drag & drop ----------

export type DropMode = 'before' | 'after' | 'child';

export interface DndHandlers {
  /** dropping a dragged task relative to a task row */
  onDropOnTask?: (dragId: string, targetId: string, mode: DropMode) => void;
  allowNest?: boolean;
}

export const DndContext = createContext<DndHandlers>({});
export const drag = { id: null as string | null, kind: null as 'task' | 'project' | 'section' | null };

// ---------- completion ----------

export function toggleComplete(task: Task) {
  if (task.completed) {
    uncompleteTask(task.id);
    return;
  }
  const res = completeTask(task.id);
  if (res === 'rescheduled') {
    const next = getState().tasks.find((t) => t.id === task.id)?.due;
    toast(next ? `Completed — next due ${dueInfo(next).label}` : '1 task completed', { undo: true });
  } else toast('1 task completed', { undo: true });
}

export function Checkbox({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const color = PRIORITY_COLORS[task.priority];
  return (
    <button
      className={`task-check p${task.priority} ${task.completed ? 'done' : ''}`}
      style={{ '--pc': color } as React.CSSProperties}
      aria-label={task.completed ? 'Mark as not completed' : 'Complete task'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );
}

// ---------- more menu ----------

export function TaskMenu({
  task, anchor, onClose, onEdit, onAddAbove, onAddBelow,
}: {
  task: Task;
  anchor: HTMLElement;
  onClose: () => void;
  onEdit?: () => void;
  onAddAbove?: () => void;
  onAddBelow?: () => void;
}) {
  const [moveA, openMove, closeMove] = useAnchor();
  const [dateA, openDate, closeDate] = useAnchor();
  const t = todayISO();
  const s = useAppState();
  const wd = weekday(t);
  const weekend = wd === 6 ? addDays(t, 7) : wd === 0 ? addDays(t, 6) : addDays(t, 6 - wd);
  const nextWeek = addDays(startOfWeek(t, s.settings.weekStart), 7);
  const setDate = (date: string | null) => {
    updateTask(task.id, { due: date ? { date, time: task.due?.time ?? null, recurrence: task.due?.recurrence ?? null } : null });
    onClose();
  };
  const hasPrevSibling = s.tasks.some(
    (x) => x.parentId === task.parentId && x.projectId === task.projectId && x.sectionId === task.sectionId && x.order < task.order && !x.completed,
  );

  return (
    <>
      <Menu
        anchor={anchor}
        onClose={() => {
          if (!moveA && !dateA) onClose();
        }}
        width={270}
        items={[
          ...(onAddAbove ? [{ label: 'Add task above', icon: <ArrowUpToLine size={16} />, onClick: onAddAbove }] : []),
          ...(onAddBelow ? [{ label: 'Add task below', icon: <ArrowDownToLine size={16} />, onClick: onAddBelow }] : []),
          ...(onEdit ? [{ label: 'Edit', icon: <Pencil size={16} />, onClick: onEdit, hint: 'Ctrl E' }] : []),
          { divider: true },
          {
            custom: (
              <div className="menu-section">
                <div className="menu-section-title">Date</div>
                <div className="menu-icon-row">
                  <button title="Today" onClick={() => setDate(t)}><CalendarCheck size={18} color="var(--due-today)" /></button>
                  <button title="Tomorrow" onClick={() => setDate(addDays(t, 1))}><Sun size={18} color="var(--due-tomorrow)" /></button>
                  <button title="This weekend" onClick={() => setDate(weekend)}><Armchair size={18} color="var(--due-week)" /></button>
                  <button title="Next week" onClick={() => setDate(nextWeek)}><ArrowRightToLine size={18} color="var(--due-week)" /></button>
                  <button title="No date" onClick={() => setDate(null)}><Ban size={18} color="var(--text-3)" /></button>
                  <button title="More options" onClick={(e) => openDate(e.currentTarget)}><MoreHorizontal size={18} /></button>
                </div>
              </div>
            ),
          },
          {
            custom: (
              <div className="menu-section">
                <div className="menu-section-title">Priority</div>
                <div className="menu-icon-row">
                  {([1, 2, 3, 4] as Priority[]).map((p) => (
                    <button
                      key={p}
                      title={`Priority ${p}`}
                      className={task.priority === p ? 'on' : ''}
                      onClick={() => {
                        updateTask(task.id, { priority: p });
                        onClose();
                      }}
                    >
                      <PriorityFlag p={p} size={18} />
                    </button>
                  ))}
                </div>
              </div>
            ),
          },
          { divider: true },
          { label: 'Move to…', icon: <CornerDownRight size={16} />, onClick: () => openMove(anchor), keepOpen: true },
          ...(hasPrevSibling && !task.completed
            ? [{ label: 'Make sub-task', icon: <GitBranch size={16} />, onClick: () => indentTask(task.id) }]
            : []),
          ...(task.parentId ? [{ label: 'Move out of parent', icon: <CornerUpLeft size={16} />, onClick: () => outdentTask(task.id) }] : []),
          { label: 'Duplicate', icon: <Copy size={16} />, onClick: () => duplicateTask(task.id) },
          {
            label: 'Copy task text',
            icon: <Link2 size={16} />,
            onClick: () => {
              navigator.clipboard?.writeText(task.content).then(() => toast('Copied to clipboard'), () => toast('Could not copy'));
            },
          },
          { divider: true },
          {
            label: 'Delete',
            icon: <Trash2 size={16} />,
            danger: true,
            hint: 'Del',
            onClick: () => confirmDeleteTask(task),
          },
        ]}
      />
      {moveA && (
        <ProjectPicker
          anchor={moveA}
          projectId={task.projectId}
          sectionId={task.sectionId}
          onClose={() => {
            closeMove();
            onClose();
          }}
          onChange={(p, sec) => {
            updateTask(task.id, { projectId: p, sectionId: sec, parentId: null });
            toast(`Task moved to ${getState().projects.find((x) => x.id === p)?.name}`, { undo: true });
          }}
        />
      )}
      {dateA && (
        <DatePopover
          anchor={dateA}
          value={task.due}
          onClose={() => {
            closeDate();
            onClose();
          }}
          onChange={(d) => updateTask(task.id, { due: d })}
        />
      )}
    </>
  );
}

export function confirmDeleteTask(task: Task) {
  const subs = getState().tasks.filter((t) => t.parentId === task.id).length;
  confirm(
    'Delete task?',
    `"${task.content}"${subs ? ` and its ${subs} sub-task${subs > 1 ? 's' : ''}` : ''} will be permanently deleted.`,
    () => {
      deleteTask(task.id);
      setUI((u) => (u.detailTaskId === task.id ? { detailTaskId: null } : {}));
      toast('Task deleted', { undo: true });
    },
  );
}

// ---------- row ----------

interface TaskItemProps {
  task: Task;
  depth?: number;
  showProject?: boolean;
  hideDate?: boolean;
  hasChildren?: boolean;
  variant?: 'row' | 'card';
  draggable?: boolean;
  onAddAt?: (taskId: string, where: 'before' | 'after') => void;
}

export function TaskItem({ task, depth = 0, showProject, hideDate, hasChildren, variant = 'row', draggable, onAddAt }: TaskItemProps) {
  const s = useAppState();
  const ui = useUI();
  const dnd = useContext(DndContext);
  const [menuA, openMenu, closeMenu] = useAnchor();
  const [dateA, openDate, closeDate] = useAnchor();
  const [completing, setCompleting] = useState(false);
  const [dropZone, setDropZone] = useState<DropMode | null>(null);
  const editing = ui.editingTaskId === task.id;
  const project = s.projects.find((p) => p.id === task.projectId);
  const section = s.sections.find((x) => x.id === task.sectionId);
  const children = s.tasks.filter((t) => t.parentId === task.id);
  const doneChildren = children.filter((t) => t.completed).length;

  if (editing) {
    const draft: Draft = {
      content: task.content, description: task.description, due: task.due, priority: task.priority, labels: task.labels,
      projectId: task.projectId, sectionId: task.sectionId, parentId: task.parentId,
    };
    return (
      <div style={{ marginLeft: depth * 28 }}>
        <TaskEditor
          mode="edit"
          initial={draft}
          variant={variant === 'card' ? 'card' : 'inline'}
          onCancel={() => setUI({ editingTaskId: null })}
          onSubmit={(d) => {
            updateTask(task.id, d);
            setUI({ editingTaskId: null });
          }}
        />
      </div>
    );
  }

  const onToggle = () => {
    if (task.completed) return toggleComplete(task);
    setCompleting(true);
    setTimeout(() => {
      setCompleting(false);
      toggleComplete(task);
    }, 280);
  };

  const info = task.due ? dueInfo(task.due) : null;
  const canDrop = !!dnd.onDropOnTask;

  return (
    <div
      className={`task-item task-${variant} ${task.completed ? 'completed' : ''} ${completing ? 'completing' : ''} ${dropZone ? 'drop-' + dropZone : ''}`}
      style={{ '--depth': depth } as React.CSSProperties}
      data-task-id={task.id}
      draggable={draggable && !task.completed}
      onDragStart={(e) => {
        drag.id = task.id;
        drag.kind = 'task';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.content);
        (e.currentTarget as HTMLElement).classList.add('dragging');
      }}
      onDragEnd={(e) => {
        drag.id = null;
        drag.kind = null;
        (e.currentTarget as HTMLElement).classList.remove('dragging');
      }}
      onDragOver={(e) => {
        if (!canDrop || drag.kind !== 'task' || !drag.id || drag.id === task.id) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const lower = e.clientY > r.top + r.height / 2;
        const nest = dnd.allowNest && variant === 'row' && lower && e.clientX > r.left + 60 + depth * 28;
        setDropZone(nest ? 'child' : lower ? 'after' : 'before');
      }}
      onDragLeave={() => setDropZone(null)}
      onDrop={(e) => {
        if (!canDrop || !drag.id || !dropZone) return;
        e.preventDefault();
        e.stopPropagation();
        dnd.onDropOnTask!(drag.id, task.id, dropZone);
        setDropZone(null);
      }}
      onClick={() => openTask(task.id)}
    >
      <div className="task-inner">
        {draggable && !task.completed && (
          <span className="drag-handle" onClick={(e) => e.stopPropagation()} title="Drag to reorder">
            <GripVertical size={16} />
          </span>
        )}
        {variant === 'row' && hasChildren !== undefined && (
          <button
            className={`collapse-btn ${hasChildren ? '' : 'invisible'}`}
            onClick={(e) => {
              e.stopPropagation();
              updateTask(task.id, { collapsed: !task.collapsed });
            }}
            aria-label={task.collapsed ? 'Expand' : 'Collapse'}
          >
            {task.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
        <Checkbox task={task} onToggle={onToggle} />
        <div className="task-body">
          <div className="task-content">{renderInline(task.content)}</div>
          {task.description && <div className="task-desc">{renderInline(task.description.split('\n')[0])}</div>}
          <div className="task-meta">
            {children.length > 0 && (
              <span className="meta-item">
                <GitBranch size={12} /> {doneChildren}/{children.length}
              </span>
            )}
            {info && !hideDate && (
              <button
                className={`meta-item due due-${info.tone}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openDate(e.currentTarget);
                }}
              >
                <Calendar size={12} /> {info.label}
                {task.due?.recurrence && <Repeat size={12} />}
              </button>
            )}
            {hideDate && task.due?.time && (
              <span className={`meta-item due due-${info!.tone}`}>
                <Calendar size={12} /> {info!.label.replace(/^\S+ /, '')}
                {task.due.recurrence && <Repeat size={12} />}
              </span>
            )}
            {hideDate && !task.due?.time && task.due?.recurrence && (
              <span className={`meta-item due due-${info!.tone}`}><Repeat size={12} /></span>
            )}
            {task.comments.length > 0 && (
              <span className="meta-item">
                <MessageSquare size={12} /> {task.comments.length}
              </span>
            )}
            {task.labels.map((n) => {
              const l = s.labels.find((x) => x.name === n);
              return (
                <span key={n} className="meta-item label" style={{ color: colorHex(l?.color ?? 'grey') }}>
                  <Tag size={12} /> {n}
                </span>
              );
            })}
            {showProject && project && (
              <span className="meta-item project-ref">
                {project.name}{section ? ` / ${section.name}` : ''} <ProjectIcon project={project} size={12} />
              </span>
            )}
          </div>
        </div>
        {!task.completed && (
          <div className="task-actions" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn sm" title="Edit task" onClick={() => setUI({ editingTaskId: task.id })}>
              <Pencil size={16} />
            </button>
            <button className="icon-btn sm hide-mobile" title="Set due date" onClick={(e) => openDate(e.currentTarget)}>
              <Calendar size={16} />
            </button>
            <button className="icon-btn sm hide-mobile" title="Comments" onClick={() => openTask(task.id)}>
              <MessageSquare size={16} />
            </button>
            <button className="icon-btn sm" title="More actions" onClick={(e) => openMenu(e.currentTarget)}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        )}
      </div>
      {menuA && (
        <TaskMenu
          task={task}
          anchor={menuA}
          onClose={closeMenu}
          onEdit={() => setUI({ editingTaskId: task.id })}
          onAddAbove={onAddAt ? () => onAddAt(task.id, 'before') : undefined}
          onAddBelow={onAddAt ? () => onAddAt(task.id, 'after') : undefined}
        />
      )}
      {dateA && <DatePopover anchor={dateA} value={task.due} onClose={closeDate} onChange={(d) => updateTask(task.id, { due: d })} />}
    </div>
  );
}

