import { useEffect, useState } from 'react';
import {
  Calendar, ChevronDown, ChevronUp, Flag, MoreHorizontal, Plus, Repeat, Send, Tag, Trash2, X,
} from 'lucide-react';
import { colorHex } from '../colors';
import { dueInfo, relativeTime } from '../dates';
import { addComment, addTask, deleteComment, updateTask, useAppState } from '../store';
import { navigate, setUI, useUI } from '../ui';
import { Modal } from './Modal';
import { DatePopover, LabelPicker, PriorityFlag, PriorityMenu, ProjectIcon, ProjectPicker } from './Pickers';
import { useAnchor } from './Popover';
import { AutoTextarea } from './TaskEditor';
import { Checkbox, renderInline, TaskMenu, toggleComplete } from './TaskItem';
import { draftFrom, TaskTree } from './TaskList';
import { TaskEditor } from './TaskEditor';

/** Ordered ids of visible task rows, used for prev / next navigation. */
function visibleTaskIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.main [data-task-id]')].map((el) => el.dataset.taskId!);
}

export function TaskDetail() {
  const ui = useUI();
  const s = useAppState();
  const task = s.tasks.find((t) => t.id === ui.detailTaskId);
  const close = () => setUI({ detailTaskId: null });

  useEffect(() => {
    if (ui.detailTaskId && !task) close();
  }, [ui.detailTaskId, task]);

  if (!task) return null;
  return <Detail key={task.id} taskId={task.id} onClose={close} />;
}

function Detail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const s = useAppState();
  const task = s.tasks.find((t) => t.id === taskId)!;
  const [title, setTitle] = useState(task.content);
  const [desc, setDesc] = useState(task.description);
  const [comment, setComment] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [subsOpen, setSubsOpen] = useState(true);
  const [moreA, openMore, closeMore] = useAnchor();
  const [projA, openProj, closeProj] = useAnchor();
  const [dateA, openDate, closeDate] = useAnchor();
  const [prioA, openPrio, closePrio] = useAnchor();
  const [labelA, openLabel, closeLabel] = useAnchor();
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => setTitle(task.content), [task.content]);
  useEffect(() => setDesc(task.description), [task.description]);

  const project = s.projects.find((p) => p.id === task.projectId)!;
  const section = s.sections.find((x) => x.id === task.sectionId);
  const parent = task.parentId ? s.tasks.find((t) => t.id === task.parentId) : null;
  const subtasks = s.tasks.filter((t) => t.parentId === task.id);
  const subDone = subtasks.filter((t) => t.completed).length;

  const ids = visibleTaskIds();
  const idx = ids.indexOf(task.id);
  const go = (d: number) => {
    const id = ids[idx + d];
    if (id) setUI({ detailTaskId: id });
  };

  const saveTitle = () => {
    const v = title.trim();
    if (v && v !== task.content) updateTask(task.id, { content: v });
    else setTitle(task.content);
    setEditingTitle(false);
  };

  return (
    <Modal onClose={onClose} width={860} className="detail-modal">
      <div className="detail-top">
        <button
          className="crumb"
          onClick={() => {
            navigate(project.isInbox ? { kind: 'inbox' } : { kind: 'project', id: project.id });
            onClose();
          }}
        >
          <ProjectIcon project={project} size={14} /> {project.name}
          {section && <span className="muted"> / {section.name}</span>}
        </button>
        <div className="detail-top-actions">
          <button className="icon-btn" disabled={idx <= 0} onClick={() => go(-1)} aria-label="Previous task"><ChevronUp size={18} /></button>
          <button className="icon-btn" disabled={idx < 0 || idx >= ids.length - 1} onClick={() => go(1)} aria-label="Next task"><ChevronDown size={18} /></button>
          <button className="icon-btn" onClick={(e) => openMore(e.currentTarget)} aria-label="More actions"><MoreHorizontal size={18} /></button>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
      </div>
      {moreA && <TaskMenu task={task} anchor={moreA} onClose={closeMore} />}

      <div className="detail-grid">
        <div className="detail-main">
          {parent && (
            <button className="parent-link" onClick={() => setUI({ detailTaskId: parent.id })}>
              <ChevronUp size={14} /> {parent.content}
            </button>
          )}
          <div className="detail-title-row">
            <Checkbox task={task} onToggle={() => toggleComplete(task)} />
            <div className="grow">
              {editingTitle ? (
                <AutoTextarea
                  className="detail-title-input"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveTitle();
                    }
                    if (e.key === 'Escape') {
                      (e.nativeEvent as Event & { _handled?: boolean })._handled = true;
                      setTitle(task.content);
                      setEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <h2 className={`detail-title ${task.completed ? 'done' : ''}`} onClick={() => setEditingTitle(true)}>
                  {renderInline(task.content)}
                </h2>
              )}
              <AutoTextarea
                className="detail-desc"
                placeholder="Add a description…"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => desc !== task.description && updateTask(task.id, { description: desc })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    (e.nativeEvent as Event & { _handled?: boolean })._handled = true;
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
              />
            </div>
          </div>

          <div className="detail-subtasks">
            {subtasks.length > 0 && (
              <button className="sub-head" onClick={() => setSubsOpen(!subsOpen)}>
                {subsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} style={{ transform: 'rotate(90deg)' }} />}
                <strong>Sub-tasks</strong> <span className="muted">{subDone}/{subtasks.length}</span>
              </button>
            )}
            {subsOpen && (
              <TaskTree
                tasks={s.tasks.filter((t) => t.parentId === task.id || isDescendant(s.tasks, t, task.id))}
                sort="manual"
                draggable
                defaults={{ projectId: task.projectId, sectionId: task.sectionId, parentId: task.id }}
              />
            )}
            {addingSub ? (
              <TaskEditor
                mode="add"
                keepOpen
                initial={draftFrom({ projectId: task.projectId, sectionId: task.sectionId, parentId: task.id })}
                onCancel={() => setAddingSub(false)}
                onSubmit={(d) => addTask({ ...d, parentId: d.projectId === task.projectId ? task.id : null })}
              />
            ) : (
              !task.completed && (
                <button className="add-task-btn" onClick={() => setAddingSub(true)}>
                  <span className="plus"><Plus size={16} /></span> Add sub-task
                </button>
              )
            )}
          </div>

          <div className="detail-comments">
            <h4>Comments {task.comments.length > 0 && <span className="muted">{task.comments.length}</span>}</h4>
            {task.comments.map((c) => (
              <div key={c.id} className="comment">
                <div className="avatar sm">{s.settings.userName.slice(0, 1).toUpperCase()}</div>
                <div className="grow">
                  <div className="comment-head">
                    <strong>{s.settings.userName}</strong> <span className="muted">{relativeTime(c.createdAt)}</span>
                    <button className="icon-btn sm comment-del" onClick={() => deleteComment(task.id, c.id)} aria-label="Delete comment">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="comment-text">{renderInline(c.text)}</div>
                </div>
              </div>
            ))}
            <div className="comment-input">
              <div className="avatar sm">{s.settings.userName.slice(0, 1).toUpperCase()}</div>
              <AutoTextarea
                placeholder="Comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && comment.trim()) {
                    e.preventDefault();
                    addComment(task.id, comment.trim());
                    setComment('');
                  }
                }}
              />
              <button
                className="icon-btn"
                disabled={!comment.trim()}
                onClick={() => {
                  addComment(task.id, comment.trim());
                  setComment('');
                }}
                aria-label="Post comment"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        <aside className="detail-side">
          <div className="side-field">
            <div className="side-label">Project</div>
            <button className="side-btn" onClick={(e) => openProj(e.currentTarget)}>
              <ProjectIcon project={project} size={14} /> {project.name}{section ? ` / ${section.name}` : ''}
            </button>
          </div>
          <div className="side-field">
            <div className="side-label">Date</div>
            <button className="side-btn" onClick={(e) => openDate(e.currentTarget)}>
              {task.due ? (
                <span className={`due-${dueInfo(task.due).tone}`}>
                  <Calendar size={14} /> {dueInfo(task.due).label}
                  {task.due.recurrence && <> <Repeat size={12} /> <span className="muted">{task.due.recurrence.text}</span></>}
                </span>
              ) : (
                <span className="muted"><Calendar size={14} /> No date</span>
              )}
            </button>
          </div>
          <div className="side-field">
            <div className="side-label">Priority</div>
            <button className="side-btn" onClick={(e) => openPrio(e.currentTarget)}>
              {task.priority < 4 ? <PriorityFlag p={task.priority} size={14} /> : <Flag size={14} />} P{task.priority}
            </button>
          </div>
          <div className="side-field">
            <div className="side-label">Labels</div>
            <button className="side-btn wrap" onClick={(e) => openLabel(e.currentTarget)}>
              {task.labels.length ? (
                task.labels.map((n) => (
                  <span key={n} className="label-pill" style={{ '--lc': colorHex(s.labels.find((l) => l.name === n)?.color ?? 'grey') } as React.CSSProperties}>
                    {n}
                  </span>
                ))
              ) : (
                <span className="muted"><Tag size={14} /> Add labels</span>
              )}
            </button>
          </div>
          <div className="side-meta muted">
            Added {relativeTime(task.createdAt)}
            {task.completedAt && <><br />Completed {relativeTime(task.completedAt)}</>}
          </div>
        </aside>
      </div>

      {projA && (
        <ProjectPicker
          anchor={projA}
          projectId={task.projectId}
          sectionId={task.sectionId}
          onClose={closeProj}
          onChange={(p, sec) => updateTask(task.id, { projectId: p, sectionId: sec, parentId: null })}
        />
      )}
      {dateA && <DatePopover anchor={dateA} value={task.due} onClose={closeDate} onChange={(d) => updateTask(task.id, { due: d })} />}
      {prioA && <PriorityMenu anchor={prioA} value={task.priority} onClose={closePrio} onChange={(p) => updateTask(task.id, { priority: p })} />}
      {labelA && <LabelPicker anchor={labelA} value={task.labels} onClose={closeLabel} onChange={(l) => updateTask(task.id, { labels: l })} />}
    </Modal>
  );
}

function isDescendant(tasks: { id: string; parentId: string | null }[], t: { parentId: string | null }, rootId: string): boolean {
  let p = t.parentId;
  while (p) {
    if (p === rootId) return true;
    p = tasks.find((x) => x.id === p)?.parentId ?? null;
  }
  return false;
}
