import { useEffect, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, PanelLeftOpen, Plus } from 'lucide-react';
import { ACCENTS } from './colors';
import { setTimeFormat } from './dates';
import { getState, useAppState } from './store';
import { clearSelection, doUndo, getUI, selectAllVisible, navigate, openDialog, openQuickAdd, parseHash, setUI, useUI, useView } from './ui';
import { Sidebar, quickAddDefaults } from './components/Sidebar';
import { TaskDetail } from './components/TaskDetail';
import { Dialogs } from './components/Dialogs';
import { BulkBar, confirmBulkDelete } from './components/BulkBar';
import { QuickAdd, SearchPalette, Toasts } from './components/Overlays';
import { modalIsOpen } from './components/Modal';
import { popoverOpen } from './components/Popover';
import { ProjectView } from './views/ProjectView';
import { TodayView, UpcomingView } from './views/DateViews';
import { CompletedView, FilterView, FiltersLabelsView, LabelView, SearchView } from './views/OtherViews';
import { EmptyState } from './views/common';

function useTheme() {
  const { theme, accent, timeFormat } = useAppState().settings;
  setTimeFormat(timeFormat);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      // the installed app's title bar takes this colour: match the page so the bar blends in
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || (dark ? '#1e1e1e' : '#ffffff');
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
    };
    apply();
    const hex = ACCENTS.find((a) => a.id === accent)?.hex ?? ACCENTS[0].hex;
    root.style.setProperty('--accent', hex);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, accent]);
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function useShortcuts() {
  useEffect(() => {
    let pending: string | null = null;
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setUI({ search: true });
        return;
      }
      if (isTyping(e)) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
        return;
      }
      if (modalIsOpen() || popoverOpen()) return;
      const selected = getUI().selected;
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllVisible();
        return;
      }
      if (selected.length && e.key === 'Escape') return clearSelection();
      if (selected.length && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        return confirmBulkDelete(selected);
      }
      if (mod || e.altKey) return;
      const k = e.key.toLowerCase();
      if (pending) {
        const p = pending;
        pending = null;
        clearTimeout(timer);
        if (p === 'g') {
          const map: Record<string, () => void> = {
            i: () => navigate({ kind: 'inbox' }),
            t: () => navigate({ kind: 'today' }),
            u: () => navigate({ kind: 'upcoming' }),
            v: () => navigate({ kind: 'filters-labels' }),
            c: () => navigate({ kind: 'completed' }),
          };
          map[k]?.();
        } else if (p === 'o' && k === 's') openDialog({ kind: 'settings' });
        return;
      }
      switch (k) {
        case 'q':
          e.preventDefault();
          openQuickAdd(quickAddDefaults(currentView()));
          break;
        case 'a': {
          const btn = [...document.querySelectorAll<HTMLButtonElement>('.main .add-task-btn')].pop();
          if (btn) {
            e.preventDefault();
            btn.click();
            btn.scrollIntoView?.({ block: 'center' });
          }
          break;
        }
        case '/':
          e.preventDefault();
          setUI({ search: true });
          break;
        case 'm':
          setUI({ sidebarOpen: !getUI().sidebarOpen });
          break;
        case '?':
          openDialog({ kind: 'shortcuts' });
          break;
        case 'g':
        case 'o':
          pending = k;
          timer = window.setTimeout(() => (pending = null), 1200);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const currentView = () => parseHash(location.hash);

function Main() {
  const view = useView();
  const s = useAppState();
  switch (view.kind) {
    case 'inbox':
      return <ProjectView key="inbox" project={s.projects.find((p) => p.isInbox)!} />;
    case 'today':
      return <TodayView />;
    case 'upcoming':
      return <UpcomingView />;
    case 'project': {
      const p = s.projects.find((x) => x.id === view.id);
      return p ? <ProjectView key={p.id} project={p} /> : <NotFound what="project" />;
    }
    case 'label': {
      const l = s.labels.find((x) => x.id === view.id);
      return l ? <LabelView key={l.id} label={l} /> : <NotFound what="label" />;
    }
    case 'filter': {
      const f = s.filters.find((x) => x.id === view.id);
      return f ? <FilterView key={f.id} filter={f} /> : <NotFound what="filter" />;
    }
    case 'filters-labels':
      return <FiltersLabelsView />;
    case 'completed':
      return <CompletedView />;
    case 'search':
      return <SearchView q={view.q} />;
  }
}

function NotFound({ what }: { what: string }) {
  return (
    <div className="view">
      <EmptyState art="search" title={`This ${what} doesn’t exist`} text="It may have been deleted." />
      <div style={{ textAlign: 'center' }}>
        <button className="btn primary" onClick={() => navigate({ kind: 'today' })}>Go to Today</button>
      </div>
    </div>
  );
}

export default function App() {
  useTheme();
  useShortcuts();
  const ui = useUI();
  const view = useView();

  useEffect(() => clearSelection(), [view]);

  useEffect(() => {
    const s = getState();
    const name =
      view.kind === 'project' ? s.projects.find((p) => p.id === view.id)?.name
      : view.kind === 'label' ? s.labels.find((l) => l.id === view.id)?.name
      : view.kind === 'filter' ? s.filters.find((f) => f.id === view.id)?.name
      : view.kind === 'filters-labels' ? 'Filters & Labels'
      : view.kind === 'search' ? `Search: ${view.q}`
      : view.kind[0].toUpperCase() + view.kind.slice(1);
    document.title = `${name ?? 'Planner'} · Leon's Planner`;
  }, [view]);

  return (
    <div className={`app ${ui.sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <Sidebar />
      <div className="sidebar-backdrop" onClick={() => setUI({ sidebarOpen: false })} />
      <main className="main">
        <div className="topbar">
          {!ui.sidebarOpen && (
            <button className="icon-btn" onClick={() => setUI({ sidebarOpen: true })} aria-label="Open sidebar" title="Open sidebar (M)">
              <PanelLeftOpen size={18} />
            </button>
          )}
          <button className="icon-btn hide-mobile" onClick={() => history.back()} aria-label="Back" title="Back"><ChevronLeft size={18} /></button>
          <button className="icon-btn hide-mobile" onClick={() => history.forward()} aria-label="Forward" title="Forward"><ChevronRight size={18} /></button>
        </div>
        <div className="main-scroll">
          <Main />
        </div>
        <button className="fab" onClick={() => openQuickAdd(quickAddDefaults(view))} aria-label="Add task">
          <Plus size={26} />
        </button>
      </main>
      <TaskDetail />
      <QuickAdd />
      <SearchPalette />
      <Dialogs />
      <BulkBar />
      <Toasts />
    </div>
  );
}
