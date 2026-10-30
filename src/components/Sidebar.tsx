import { useState, type ReactNode } from 'react';
import {
  Archive, CalendarDays, ChevronDown, ChevronRight, CircleCheckBig, Heart, HeartOff, Inbox,
  Keyboard, LayoutGrid, MoreHorizontal, PanelLeftClose, Pencil, Plus, Search, Settings, SlidersHorizontal, Tag,
  Trash2, TrendingUp,
} from 'lucide-react';
import { colorHex } from '../colors';
import { todayISO, toISO } from '../dates';
import { compileQuery } from '../query';
import {
  deleteProject, getState, moveTaskToSection, reorderProject, updateFilter, updateLabel, updateProject, useAppState,
} from '../store';
import type { Project, View } from '../types';
import { confirm, navigate, openDialog, openQuickAdd, setUI, toast, useView } from '../ui';
import { Logo } from './Logo';
import { Menu, useAnchor } from './Popover';
import { drag } from './TaskItem';

function NavItem({
  icon, label, count, active, onClick, extra, indent = 0, onDragOver, onDrop, onDragLeave, dropClass, draggable, onDragStart,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  extra?: ReactNode;
  indent?: number;
  onDragOver?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  dropClass?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler;
}) {
  return (
    <div
      className={`nav-item ${active ? 'active' : ''} ${dropClass ?? ''}`}
      style={{ paddingLeft: 8 + indent * 16 }}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      draggable={draggable}
      onDragStart={onDragStart}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count ? <span className="nav-count">{count}</span> : null}
      {extra}
    </div>
  );
}

function isActive(view: View, target: View) {
  if (view.kind !== target.kind) return false;
  if ('id' in view && 'id' in target) return view.id === target.id;
  return true;
}

function ProjectMenu({ project, anchor, onClose }: { project: Project; anchor: HTMLElement; onClose: () => void }) {
  return (
    <Menu
      anchor={anchor}
      onClose={onClose}
      items={[
        { label: 'Edit', icon: <Pencil size={16} />, onClick: () => openDialog({ kind: 'project', id: project.id }) },
        { label: 'Add sub-project', icon: <Plus size={16} />, onClick: () => openDialog({ kind: 'project', parentId: project.id }) },
        {
          label: project.favorite ? 'Remove from favorites' : 'Add to favorites',
          icon: project.favorite ? <HeartOff size={16} /> : <Heart size={16} />,
          onClick: () => updateProject(project.id, { favorite: !project.favorite }),
        },
        { divider: true },
        {
          label: 'Archive',
          icon: <Archive size={16} />,
          onClick: () => {
            updateProject(project.id, { archived: true });
            toast('Project archived', { undo: true });
          },
        },
        {
          label: 'Delete',
          icon: <Trash2 size={16} />,
          danger: true,
          onClick: () =>
            confirm('Delete project?', `"${project.name}" and all of its tasks will be permanently deleted.`, () => {
              deleteProject(project.id);
              toast('Project deleted', { undo: true });
            }),
        },
      ]}
    />
  );
}

function ProjectRow({ project, depth, view, counts }: { project: Project; depth: number; view: View; counts: Map<string, number> }) {
  const s = useAppState();
  const [a, open, close] = useAnchor();
  const [drop, setDrop] = useState<'before' | 'after' | 'child' | 'task' | null>(null);
  const children = s.projects.filter((p) => p.parentId === project.id && !p.archived).sort((x, y) => x.order - y.order);
  return (
    <>
      <NavItem
        indent={depth}
        icon={
          children.length ? (
            <span className="proj-icon-toggle">
              <span className="hash" style={{ color: colorHex(project.color) }}>#</span>
              <button
                className="proj-collapse"
                onClick={(e) => {
                  e.stopPropagation();
                  updateProject(project.id, { collapsed: !project.collapsed });
                }}
                aria-label="Toggle sub-projects"
              >
                {project.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            </span>
          ) : (
            <span className="hash" style={{ color: colorHex(project.color) }}>#</span>
          )
        }
        label={project.name}
        count={counts.get(project.id)}
        active={isActive(view, { kind: 'project', id: project.id })}
        onClick={() => navigate({ kind: 'project', id: project.id })}
        draggable
        onDragStart={(e) => {
          drag.id = project.id;
          drag.kind = 'project';
          e.dataTransfer.setData('text/plain', project.name);
        }}
        onDragOver={(e) => {
          if (!drag.id || drag.id === project.id) return;
          e.preventDefault();
          if (drag.kind === 'task') return setDrop('task');
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          setDrop(y < r.height * 0.3 ? 'before' : y > r.height * 0.7 ? 'after' : 'child');
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (drag.kind === 'project' && drag.id && drop && drop !== 'task') reorderProject(drag.id, project.id, drop);
          if (drag.kind === 'task' && drag.id) {
            moveTaskToSection(drag.id, project.id, null);
            toast(`Task moved to ${project.name}`, { undo: true });
          }
          setDrop(null);
        }}
        dropClass={drop ? `drop-${drop}` : ''}
        extra={
          <button
            className="nav-more"
            onClick={(e) => {
              e.stopPropagation();
              open(e.currentTarget);
            }}
            aria-label="Project actions"
          >
            <MoreHorizontal size={16} />
          </button>
        }
      />
      {a && <ProjectMenu project={project} anchor={a} onClose={close} />}
      {!project.collapsed && children.map((c) => <ProjectRow key={c.id} project={c} depth={depth + 1} view={view} counts={counts} />)}
    </>
  );
}

export function Sidebar() {
  const s = useAppState();
  const view = useView();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [favOpen, setFavOpen] = useState(true);
  const [userA, openUser, closeUser] = useAnchor();
  const [showArchived, setShowArchived] = useState(false);
  const today = todayISO();

  const open = s.tasks.filter((t) => !t.completed);
  const counts = new Map<string, number>();
  for (const t of open) counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
  const inbox = s.projects.find((p) => p.isInbox)!;
  const todayCount = open.filter((t) => t.due && t.due.date <= today).length;
  const roots = s.projects.filter((p) => !p.isInbox && !p.parentId && !p.archived).sort((a, b) => a.order - b.order);
  const archived = s.projects.filter((p) => p.archived);
  const favorites = [
    ...s.projects.filter((p) => p.favorite && !p.archived).map((p) => ({ kind: 'project' as const, item: p })),
    ...s.labels.filter((l) => l.favorite).map((l) => ({ kind: 'label' as const, item: l })),
    ...s.filters.filter((f) => f.favorite).map((f) => ({ kind: 'filter' as const, item: f })),
  ];
  const doneToday = s.log.filter((l) => toISO(new Date(l.completedAt)) === today).length;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="user-btn" onClick={(e) => openUser(e.currentTarget)}>
          <Logo size={26} />
          <span className="user-name">{s.settings.userName}</span>
          <ChevronDown size={14} />
        </button>
        <div className="sidebar-top-actions">
          <button
            className="icon-btn"
            title="Productivity"
            onClick={() => openDialog({ kind: 'productivity' })}
          >
            <TrendingUp size={18} />
            <span className="goal-dot">{doneToday}/{s.settings.dailyGoal}</span>
          </button>
          <button className="icon-btn" title="Close sidebar (M)" onClick={() => setUI({ sidebarOpen: false })}>
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>
      {userA && (
        <Menu
          anchor={userA}
          onClose={closeUser}
          width={240}
          items={[
            { label: 'Settings', icon: <Settings size={16} />, onClick: () => openDialog({ kind: 'settings' }), hint: 'O S' },
            { label: 'Productivity', icon: <TrendingUp size={16} />, onClick: () => openDialog({ kind: 'productivity' }) },
            { label: 'Keyboard shortcuts', icon: <Keyboard size={16} />, onClick: () => openDialog({ kind: 'shortcuts' }), hint: '?' },
            { divider: true },
            { label: showArchived ? 'Hide archived projects' : 'Show archived projects', icon: <Archive size={16} />, onClick: () => setShowArchived(!showArchived) },
          ]}
        />
      )}

      <nav className="sidebar-nav">
        <button className="nav-item add-task-nav" onClick={() => openQuickAdd(quickAddDefaults(view))}>
          <span className="nav-icon add-circle"><Plus size={16} strokeWidth={2.5} /></span>
          <span className="nav-label">Add task</span>
        </button>
        <NavItem icon={<Search size={18} />} label="Search" onClick={() => setUI({ search: true })} />
        <NavItem
          icon={<Inbox size={18} />}
          label="Inbox"
          count={counts.get(inbox.id)}
          active={view.kind === 'inbox'}
          onClick={() => navigate({ kind: 'inbox' })}
        />
        <NavItem
          icon={<TodayIcon day={new Date().getDate()} />}
          label="Today"
          count={todayCount}
          active={view.kind === 'today'}
          onClick={() => navigate({ kind: 'today' })}
        />
        <NavItem icon={<CalendarDays size={18} />} label="Upcoming" active={view.kind === 'upcoming'} onClick={() => navigate({ kind: 'upcoming' })} />
        <NavItem icon={<LayoutGrid size={18} />} label="Filters & Labels" active={view.kind === 'filters-labels'} onClick={() => navigate({ kind: 'filters-labels' })} />
        <NavItem icon={<CircleCheckBig size={18} />} label="Completed" active={view.kind === 'completed'} onClick={() => navigate({ kind: 'completed' })} />

        {favorites.length > 0 && (
          <div className="nav-group">
            <div className="nav-group-head">
              <button onClick={() => setFavOpen(!favOpen)}>Favorites</button>
              <button className="icon-btn sm" onClick={() => setFavOpen(!favOpen)} aria-label="Toggle favorites">
                {favOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>
            {favOpen &&
              favorites.map((f) =>
                f.kind === 'project' ? (
                  <NavItem
                    key={f.item.id}
                    icon={<span className="hash" style={{ color: colorHex(f.item.color) }}>#</span>}
                    label={f.item.name}
                    count={counts.get(f.item.id)}
                    active={isActive(view, { kind: 'project', id: f.item.id })}
                    onClick={() => navigate({ kind: 'project', id: f.item.id })}
                  />
                ) : f.kind === 'label' ? (
                  <NavItem
                    key={f.item.id}
                    icon={<Tag size={16} color={colorHex(f.item.color)} />}
                    label={f.item.name}
                    count={open.filter((t) => t.labels.includes(f.item.name)).length}
                    active={isActive(view, { kind: 'label', id: f.item.id })}
                    onClick={() => navigate({ kind: 'label', id: f.item.id })}
                    extra={<button className="nav-more" onClick={(e) => { e.stopPropagation(); updateLabel(f.item.id, { favorite: false }); }} aria-label="Unfavorite"><HeartOff size={14} /></button>}
                  />
                ) : (
                  <NavItem
                    key={f.item.id}
                    icon={<SlidersHorizontal size={16} color={colorHex(f.item.color)} />}
                    label={f.item.name}
                    count={(() => {
                      const fn = compileQuery(f.item.query);
                      return fn ? open.filter((t) => fn(t, s)).length : 0;
                    })()}
                    active={isActive(view, { kind: 'filter', id: f.item.id })}
                    onClick={() => navigate({ kind: 'filter', id: f.item.id })}
                    extra={<button className="nav-more" onClick={(e) => { e.stopPropagation(); updateFilter(f.item.id, { favorite: false }); }} aria-label="Unfavorite"><HeartOff size={14} /></button>}
                  />
                ),
              )}
          </div>
        )}

        <div className="nav-group">
          <div className="nav-group-head">
            <button onClick={() => setProjectsOpen(!projectsOpen)}>My Projects</button>
            <div>
              <button className="icon-btn sm" onClick={() => openDialog({ kind: 'project' })} aria-label="Add project" title="Add project">
                <Plus size={16} />
              </button>
              <button className="icon-btn sm" onClick={() => setProjectsOpen(!projectsOpen)} aria-label="Toggle projects">
                {projectsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>
          </div>
          {projectsOpen && roots.map((p) => <ProjectRow key={p.id} project={p} depth={0} view={view} counts={counts} />)}
          {projectsOpen && roots.length === 0 && (
            <button className="nav-hint" onClick={() => openDialog({ kind: 'project' })}>Create your first project</button>
          )}
        </div>

        {showArchived && archived.length > 0 && (
          <div className="nav-group">
            <div className="nav-group-head"><span>Archived</span></div>
            {archived.map((p) => (
              <NavItem
                key={p.id}
                icon={<Archive size={16} color={colorHex(p.color)} />}
                label={p.name}
                active={isActive(view, { kind: 'project', id: p.id })}
                onClick={() => navigate({ kind: 'project', id: p.id })}
              />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

function TodayIcon({ day }: { day: number }) {
  return (
    <span className="today-icon">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', inset: 0 }}>
        <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
        <path d="M8 2.5v4M16 2.5v4M3 9.5h18" strokeLinecap="round" />
        <text x="12" y="18.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">{day}</text>
      </svg>
    </span>
  );
}

export function quickAddDefaults(view: View) {
  const s = getState();
  if (view.kind === 'project') return { projectId: view.id };
  if (view.kind === 'today') return { due: { date: todayISO() } };
  if (view.kind === 'label') {
    const l = s.labels.find((x) => x.id === view.id);
    return l ? { labels: [l.name] } : {};
  }
  return {};
}
