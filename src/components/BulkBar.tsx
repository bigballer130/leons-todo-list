import { CalendarDays, CheckCheck, CornerDownRight, Flag, ListChecks, Tag, Trash2, X } from 'lucide-react';
import { bulkComplete, bulkDelete, bulkMove, bulkUpdate, getState, useAppState } from '../store';
import type { Priority } from '../types';
import { clearSelection, confirm, selectAllVisible, toast, useUI } from '../ui';
import { DatePopover, LabelPicker, PriorityMenu, ProjectPicker } from './Pickers';
import { useAnchor } from './Popover';

export function confirmBulkDelete(ids: string[]) {
  const n = ids.length;
  confirm(`Delete ${n} task${n === 1 ? '' : 's'}?`, `The selected task${n === 1 ? '' : 's'} and any sub-tasks will be permanently deleted.`, () => {
    bulkDelete(ids);
    clearSelection();
    toast(`${n} task${n === 1 ? '' : 's'} deleted`, { undo: true });
  });
}

/** Floating action bar shown while tasks are selected. */
export function BulkBar() {
  const { selected } = useUI();
  const s = useAppState();
  const [dateA, openDate, closeDate] = useAnchor();
  const [prioA, openPrio, closePrio] = useAnchor();
  const [labelA, openLabel, closeLabel] = useAnchor();
  const [moveA, openMove, closeMove] = useAnchor();
  const ids = selected.filter((id) => s.tasks.some((t) => t.id === id));
  if (!ids.length) return null;
  const tasks = s.tasks.filter((t) => ids.includes(t.id));
  const n = ids.length;
  const plural = `${n} task${n === 1 ? '' : 's'}`;
  const commonLabels = tasks.reduce<string[]>((acc, t, i) => (i === 0 ? t.labels : acc.filter((l) => t.labels.includes(l))), []);
  const commonPriority = tasks.every((t) => t.priority === tasks[0].priority) ? tasks[0].priority : 4;

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Selected tasks">
      <span className="bulk-count">{n} selected</span>
      <button className="bulk-btn" onClick={() => { bulkComplete(ids); clearSelection(); toast(`${plural} completed`, { undo: true }); }} title="Complete">
        <CheckCheck size={17} /><span>Complete</span>
      </button>
      <button className="bulk-btn" onClick={(e) => openDate(e.currentTarget)} title="Reschedule"><CalendarDays size={17} /><span>Date</span></button>
      <button className="bulk-btn" onClick={(e) => openPrio(e.currentTarget)} title="Priority"><Flag size={17} /><span>Priority</span></button>
      <button className="bulk-btn" onClick={(e) => openLabel(e.currentTarget)} title="Labels"><Tag size={17} /><span>Labels</span></button>
      <button className="bulk-btn" onClick={(e) => openMove(e.currentTarget)} title="Move to project"><CornerDownRight size={17} /><span>Move</span></button>
      <button className="bulk-btn danger" onClick={() => confirmBulkDelete(ids)} title="Delete"><Trash2 size={17} /><span>Delete</span></button>
      <span className="bulk-sep" />
      <button className="bulk-btn" onClick={selectAllVisible} title="Select all (Ctrl A)"><ListChecks size={17} /><span>All</span></button>
      <button className="icon-btn" onClick={clearSelection} aria-label="Clear selection" title="Clear selection (Esc)"><X size={18} /></button>

      {dateA && (
        <DatePopover
          anchor={dateA}
          value={null}
          onClose={closeDate}
          onChange={(d) => {
            // a new date keeps each task's own time and repeat rule unless the picker set them
            bulkUpdate(ids, (t) => ({
              due: d ? { date: d.date, time: d.time ?? t.due?.time ?? null, recurrence: d.recurrence ?? t.due?.recurrence ?? null } : null,
            }));
            toast(d ? `${plural} rescheduled` : `Dates removed from ${plural}`, { undo: true });
          }}
        />
      )}
      {prioA && (
        <PriorityMenu
          anchor={prioA}
          value={commonPriority}
          onClose={closePrio}
          onChange={(p: Priority) => { bulkUpdate(ids, () => ({ priority: p })); toast(`Priority ${p} set on ${plural}`, { undo: true }); }}
        />
      )}
      {labelA && (
        <LabelPicker
          anchor={labelA}
          value={commonLabels}
          onClose={closeLabel}
          onChange={(next) => {
            // ticking a label adds it to every selected task; unticking removes it from all
            const added = next.filter((l) => !commonLabels.includes(l));
            const removed = commonLabels.filter((l) => !next.includes(l));
            bulkUpdate(ids, (t) => ({ labels: [...new Set([...t.labels.filter((l) => !removed.includes(l)), ...added])] }));
          }}
        />
      )}
      {moveA && (
        <ProjectPicker
          anchor={moveA}
          projectId=""
          sectionId={null}
          onClose={closeMove}
          onChange={(p, sec) => {
            bulkMove(ids, p, sec);
            toast(`${plural} moved to ${getState().projects.find((x) => x.id === p)?.name}`, { undo: true });
          }}
        />
      )}
    </div>
  );
}
