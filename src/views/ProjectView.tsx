import { useState } from 'react';
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, Heart, HeartOff, MoreHorizontal, Pencil, Plus, Trash2,
} from 'lucide-react';
import {
  addSection, addTask, deleteProject, deleteSection, getState, moveSection, moveTask, moveTaskToSection, uid,
  updateProject, updateSection, useAppState, setState,
} from '../store';
import type { Project, Section, Task } from '../types';
import { confirm, navigate, openDialog, toast } from '../ui';
import { Menu, useAnchor } from '../components/Popover';
import { DndContext, drag, TaskItem, type DropMode } from '../components/TaskItem';
import { draftFrom, InlineAdd, sortTasks, TaskTree, AddTaskButton } from '../components/TaskList';
import { TaskEditor } from '../components/TaskEditor';
import { EmptyState, useViewOptions, ViewHeader, ViewOptionsButton } from './common';
import { ProjectIcon } from '../components/Pickers';

export function ProjectView({ project }: { project: Project }) {
  const s = useAppState();
  const key = `project:${project.id}`;
  const opts = useViewOptions(key);
  const sections = s.sections.filter((x) => x.projectId === project.id).sort((a, b) => a.order - b.order);
  const tasks = s.tasks.filter((t) => t.projectId === project.id && (opts.showCompleted || !t.completed));
  const [menuA, openMenu, closeMenu] = useAnchor();
  const openCount = s.tasks.filter((t) => t.projectId === project.id && !t.completed).length;

  const parent = project.parentId ? s.projects.find((p) => p.id === project.parentId) : null;

  return (
    <div className={`view project-view ${project.layout === 'board' ? 'board-mode' : ''}`}>
      {parent && (
        <div className="breadcrumb">
          <button onClick={() => navigate({ kind: 'project', id: parent.id })}>
            <ProjectIcon project={parent} size={12} /> {parent.name}
          </button>
          <span>/</span>
        </div>
      )}
      <ViewHeader
        title={project.name}
        onTitleEdit={project.isInbox ? undefined : (name) => updateProject(project.id, { name })}
        subtitle={project.archived ? 'This project is archived' : `${openCount} task${openCount === 1 ? '' : 's'}`}
        actions={
          <>
            <ViewOptionsButton
              viewKey={key}
              layout={project.layout}
              onLayout={(layout) => updateProject(project.id, { layout })}
            />
            <button className="header-btn icon-only" onClick={(e) => openMenu(e.currentTarget)} aria-label="Project actions">
              <MoreHorizontal size={18} />
            </button>
          </>
        }
      />
      {menuA && (
        <Menu
          anchor={menuA}
          onClose={closeMenu}
          align="end"
          items={[
            ...(!project.isInbox
              ? [
                  { label: 'Edit project', icon: <Pencil size={16} />, onClick: () => openDialog({ kind: 'project', id: project.id }) },
                  {
                    label: project.favorite ? 'Remove from favorites' : 'Add to favorites',
                    icon: project.favorite ? <HeartOff size={16} /> : <Heart size={16} />,
                    onClick: () => updateProject(project.id, { favorite: !project.favorite }),
                  },
                  { label: 'Add sub-project', icon: <Plus size={16} />, onClick: () => openDialog({ kind: 'project', parentId: project.id }) },
                  { divider: true },
                ]
              : []),
            { label: 'Add section', icon: <Plus size={16} />, onClick: () => addSection(project.id, 'Untitled section') },
            ...(!project.isInbox
              ? [
                  { label: 'Duplicate project', icon: <Copy size={16} />, onClick: () => duplicateProject(project.id) },
                  {
                    label: project.archived ? 'Unarchive' : 'Archive',
                    icon: project.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />,
                    onClick: () => {
                      updateProject(project.id, { archived: !project.archived });
                      toast(project.archived ? 'Project restored' : 'Project archived', { undo: true });
                    },
                  },
                  { divider: true },
                  {
                    label: 'Delete project',
                    icon: <Trash2 size={16} />,
                    danger: true,
                    onClick: () =>
                      confirm('Delete project?', `"${project.name}" and all of its tasks will be permanently deleted.`, () => {
                        deleteProject(project.id);
                        navigate({ kind: 'inbox' });
                        toast('Project deleted', { undo: true });
                      }),
                  },
                ]
              : []),
          ]}
        />
      )}
      {project.layout === 'board' ? (
        <Board project={project} sections={sections} tasks={tasks} />
      ) : (
        <div className="list-body">
          <TaskTree
            tasks={tasks.filter((t) => !t.sectionId)}
            sort={opts.sort}
            draggable
            defaults={{ projectId: project.id, sectionId: null }}
          />
          <InlineAdd defaults={{ projectId: project.id, sectionId: null }} />
          {sections.length === 0 && tasks.length === 0 && (
            <EmptyState
              art={project.isInbox ? 'inbox' : 'done'}
              title={project.isInbox ? 'Your inbox is empty' : 'Nothing here yet'}
              text={
                project.isInbox
                  ? 'Jot down anything that comes to mind and sort it into projects whenever it suits you.'
                  : 'Add a first task or a section to give this project some shape.'
              }
            />
          )}
          <AddSectionDivider projectId={project.id} afterSectionId={null} />
          {sections.map((sec) => (
            <SectionBlock key={sec.id} section={sec} tasks={tasks.filter((t) => t.sectionId === sec.id)} sort={opts.sort} />
          ))}
        </div>
      )}
    </div>
  );
}

function duplicateProject(id: string) {
  setState((s) => {
    const src = s.projects.find((p) => p.id === id);
    if (!src) return s;
    const newId = uid();
    const secMap = new Map<string, string>();
    const secs = s.sections.filter((x) => x.projectId === id).map((x) => {
      const nid = uid();
      secMap.set(x.id, nid);
      return { ...x, id: nid, projectId: newId };
    });
    const taskMap = new Map<string, string>();
    const srcTasks = s.tasks.filter((t) => t.projectId === id && !t.completed);
    srcTasks.forEach((t) => taskMap.set(t.id, uid()));
    const tasks = srcTasks.map((t) => ({
      ...t,
      id: taskMap.get(t.id)!,
      projectId: newId,
      sectionId: t.sectionId ? secMap.get(t.sectionId) ?? null : null,
      parentId: t.parentId ? taskMap.get(t.parentId) ?? null : null,
      comments: [],
    }));
    return {
      ...s,
      projects: [...s.projects, { ...src, id: newId, name: `Copy of ${src.name}`, order: src.order + 0.5, favorite: false }],
      sections: [...s.sections, ...secs],
      tasks: [...s.tasks, ...tasks],
    };
  }, true);
  toast('Project duplicated', { undo: true });
}

function AddSectionDivider({ projectId, afterSectionId }: { projectId: string; afterSectionId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (open) {
    return (
      <SectionNameForm
        value={name}
        onChange={setName}
        submitLabel="Add section"
        onCancel={() => {
          setOpen(false);
          setName('');
        }}
        onSubmit={() => {
          if (!name.trim()) return;
          addSection(projectId, name.trim(), afterSectionId);
          setOpen(false);
          setName('');
        }}
      />
    );
  }
  return (
    <button className="add-section-divider" onClick={() => setOpen(true)}>
      <span>Add section</span>
    </button>
  );
}

function SectionNameForm({
  value, onChange, onSubmit, onCancel, submitLabel,
}: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; submitLabel: string }) {
  return (
    <div className="section-form">
      <input
        autoFocus
        placeholder="Name this section"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') {
            (e.nativeEvent as Event & { _handled?: boolean })._handled = true;
            onCancel();
          }
        }}
      />
      <div className="row">
        <button className="btn primary" disabled={!value.trim()} onClick={onSubmit}>{submitLabel}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SectionMenu({ section, anchor, onClose, onRename }: { section: Section; anchor: HTMLElement; onClose: () => void; onRename: () => void }) {
  const s = getState();
  const count = s.tasks.filter((t) => t.sectionId === section.id).length;
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      align="end"
      items={[
        { label: 'Rename section', icon: <Pencil size={16} />, onClick: onRename },
        {
          label: 'Duplicate',
          icon: <Copy size={16} />,
          onClick: () => {
            const sec = addSection(section.projectId, `${section.name} (copy)`, section.id);
            s.tasks
              .filter((t) => t.sectionId === section.id && !t.parentId && !t.completed)
              .sort((a, b) => a.order - b.order)
              .forEach((t) => addTask({ ...t, sectionId: sec.id, parentId: null }));
          },
        },
        { divider: true },
        {
          label: 'Delete section',
          icon: <Trash2 size={16} />,
          danger: true,
          onClick: () =>
            confirm('Delete section?', `"${section.name}"${count ? ` and its ${count} task${count === 1 ? '' : 's'}` : ''} will be permanently deleted.`, () => {
              deleteSection(section.id);
              toast('Section deleted', { undo: true });
            }),
        },
      ]}
    />
  );
}

function SectionBlock({ section, tasks, sort }: { section: Section; tasks: Task[]; sort: Parameters<typeof sortTasks>[1] }) {
  const [menuA, openMenu, closeMenu] = useAnchor();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const [over, setOver] = useState<'before' | 'after' | 'into' | null>(null);
  const openCount = tasks.filter((t) => !t.completed).length;

  return (
    <section className={`section-block ${over ? 'drop-' + over : ''}`}>
      {renaming ? (
        <SectionNameForm
          value={name}
          onChange={setName}
          submitLabel="Save"
          onCancel={() => setRenaming(false)}
          onSubmit={() => {
            if (name.trim()) updateSection(section.id, { name: name.trim() });
            setRenaming(false);
          }}
        />
      ) : (
        <div
          className="section-header"
          draggable
          onDragStart={(e) => {
            drag.id = section.id;
            drag.kind = 'section';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', section.name);
          }}
          onDragEnd={() => {
            drag.id = null;
            drag.kind = null;
          }}
          onDragOver={(e) => {
            if (drag.kind === 'section' && drag.id !== section.id) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setOver(e.clientY < r.top + r.height / 2 ? 'before' : 'after');
            } else if (drag.kind === 'task') {
              e.preventDefault();
              setOver('into');
            }
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (drag.kind === 'section' && drag.id && over && over !== 'into') moveSection(drag.id, section.id, over);
            if (drag.kind === 'task' && drag.id) moveTaskToSection(drag.id, section.projectId, section.id);
            setOver(null);
          }}
        >
          <button className="collapse-btn" onClick={() => updateSection(section.id, { collapsed: !section.collapsed })} aria-label="Toggle section">
            {section.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <h3 onDoubleClick={() => setRenaming(true)}>{section.name}</h3>
          <span className="count">{openCount}</span>
          <button className="icon-btn sm section-more" onClick={(e) => openMenu(e.currentTarget)} aria-label="Section actions">
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}
      {menuA && <SectionMenu section={section} anchor={menuA} onClose={closeMenu} onRename={() => { setName(section.name); setRenaming(true); }} />}
      {!section.collapsed && (
        <>
          <TaskTree tasks={tasks} sort={sort} draggable defaults={{ projectId: section.projectId, sectionId: section.id }} />
          <InlineAdd defaults={{ projectId: section.projectId, sectionId: section.id }} />
        </>
      )}
      <AddSectionDivider projectId={section.projectId} afterSectionId={section.id} />
    </section>
  );
}

// ---------------- Board ----------------

function Board({ project, sections, tasks }: { project: Project; sections: Section[]; tasks: Task[] }) {
  const opts = useViewOptions(`project:${project.id}`);
  const columns: Array<{ section: Section | null; tasks: Task[] }> = [
    { section: null, tasks: tasks.filter((t) => !t.sectionId) },
    ...sections.map((sec) => ({ section: sec, tasks: tasks.filter((t) => t.sectionId === sec.id) })),
  ];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  return (
    <DndContext.Provider
      value={{
        allowNest: false,
        onDropOnTask: opts.sort === 'manual' ? (d: string, t: string, m: DropMode) => moveTask(d, t, m) : undefined,
      }}
    >
      <div className="board">
        {columns
          .filter((c) => c.section || c.tasks.length > 0 || sections.length === 0)
          .map((c) => (
            <BoardColumn key={c.section?.id ?? 'none'} project={project} section={c.section} tasks={c.tasks} sort={opts.sort} />
          ))}
        <div className="board-col add-col">
          {adding ? (
            <SectionNameForm
              value={name}
              onChange={setName}
              submitLabel="Add section"
              onCancel={() => setAdding(false)}
              onSubmit={() => {
                if (!name.trim()) return;
                addSection(project.id, name.trim());
                setName('');
                setAdding(false);
              }}
            />
          ) : (
            <button className="add-section-col" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add section
            </button>
          )}
        </div>
      </div>
    </DndContext.Provider>
  );
}

function BoardColumn({ project, section, tasks, sort }: { project: Project; section: Section | null; tasks: Task[]; sort: Parameters<typeof sortTasks>[1] }) {
  const [menuA, openMenu, closeMenu] = useAnchor();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section?.name ?? '');
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState(false);
  const roots = sortTasks(tasks.filter((t) => !t.parentId || !tasks.some((p) => p.id === t.parentId)), sort);

  return (
    <div
      className={`board-col ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        if (drag.kind === 'task' || (drag.kind === 'section' && section)) {
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
        if (drag.kind === 'task' && drag.id) moveTaskToSection(drag.id, project.id, section?.id ?? null);
        if (drag.kind === 'section' && drag.id && section) moveSection(drag.id, section.id, 'before');
      }}
    >
      {renaming && section ? (
        <SectionNameForm
          value={name}
          onChange={setName}
          submitLabel="Save"
          onCancel={() => setRenaming(false)}
          onSubmit={() => {
            if (name.trim()) updateSection(section.id, { name: name.trim() });
            setRenaming(false);
          }}
        />
      ) : (
        <div
          className="board-col-header"
          draggable={!!section}
          onDragStart={(e) => {
            if (!section) return;
            drag.id = section.id;
            drag.kind = 'section';
            e.dataTransfer.setData('text/plain', section.name);
          }}
          onDragEnd={() => {
            drag.id = null;
            drag.kind = null;
          }}
        >
          <h3 onDoubleClick={() => section && setRenaming(true)}>{section?.name ?? '(No section)'}</h3>
          <span className="count">{tasks.filter((t) => !t.completed).length}</span>
          {section && (
            <button className="icon-btn sm" onClick={(e) => openMenu(e.currentTarget)} aria-label="Section actions">
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>
      )}
      {menuA && section && <SectionMenu section={section} anchor={menuA} onClose={closeMenu} onRename={() => { setName(section.name); setRenaming(true); }} />}
      <div className="board-cards">
        {roots.map((t) => (
          <TaskItem key={t.id} task={t} variant="card" draggable={sort === 'manual'} />
        ))}
        {adding ? (
          <TaskEditor
            mode="add"
            keepOpen
            variant="card"
            initial={draftFrom({ projectId: project.id, sectionId: section?.id ?? null })}
            onCancel={() => setAdding(false)}
            onSubmit={(d) => addTask(d)}
          />
        ) : (
          <AddTaskButton onClick={() => setAdding(true)} />
        )}
      </div>
    </div>
  );
}
