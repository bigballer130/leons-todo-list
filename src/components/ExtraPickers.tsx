import { useState } from 'react';
import { Bell, BellRing, Plus, Timer, Trash2, X } from 'lucide-react';
import { formatDuration, reminderLabel, todayISO } from '../dates';
import { uid } from '../store';
import type { Due, Reminder } from '../types';
import { DatePicker } from './Pickers';
import { Popover } from './Popover';

export function DeadlinePopover({
  anchor, value, onChange, onClose,
}: { anchor: HTMLElement; value: string | null; onChange: (d: string | null) => void; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={270}>
      <div className="popover-title">Deadline</div>
      <DatePicker
        dateOnly
        value={value ? { date: value } : null}
        onChange={(d) => onChange(d?.date ?? null)}
        onClose={onClose}
      />
    </Popover>
  );
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function DurationPopover({
  anchor, value, onChange, onClose,
}: { anchor: HTMLElement; value: number | null; onChange: (m: number | null) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const apply = (m: number | null) => {
    onChange(m);
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={250}>
      <div className="popover-title"><Timer size={14} /> Duration</div>
      <div className="duration-grid">
        {DURATIONS.map((m) => (
          <button key={m} className={`chip ${value === m ? 'active on' : ''}`} onClick={() => apply(m)}>
            {formatDuration(m)}
          </button>
        ))}
      </div>
      <div className="pop-row">
        <input
          type="number"
          min={1}
          max={1440}
          placeholder="Minutes"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && +custom > 0) apply(Math.min(1440, Math.round(+custom)));
          }}
        />
        <button className="btn primary sm" disabled={!(+custom > 0)} onClick={() => apply(Math.min(1440, Math.round(+custom)))}>
          Set
        </button>
      </div>
      {value && (
        <button className="menu-item danger" onClick={() => apply(null)}>
          <span className="menu-icon"><X size={16} /></span> Remove duration
        </button>
      )}
    </Popover>
  );
}

const RELATIVE = [0, 10, 30, 60, 120, 1440];

export function RemindersPopover({
  anchor, value, due, onChange, onClose,
}: { anchor: HTMLElement; value: Reminder[]; due: Due | null; onChange: (r: Reminder[]) => void; onClose: () => void }) {
  const [date, setDate] = useState(due?.date ?? todayISO());
  const [time, setTime] = useState(due?.time ?? '09:00');
  const add = (r: Reminder) => onChange([...value, r]);
  const hasRelative = (m: number) => value.some((r) => r.type === 'relative' && r.minutes === m);
  return (
    <Popover anchor={anchor} onClose={onClose} width={290}>
      <div className="popover-title"><Bell size={14} /> Reminders</div>
      {value.length > 0 && (
        <div className="reminder-list">
          {value.map((r) => (
            <div key={r.id} className="reminder-row">
              <BellRing size={14} />
              <span className="grow">{reminderLabel(r)}</span>
              <button className="icon-btn sm" aria-label="Remove reminder" onClick={() => onChange(value.filter((x) => x.id !== r.id))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="pop-section">
        <div className="field-label">Before the task{due?.time ? '' : ' (uses 9:00 AM when no time is set)'}</div>
        <div className="duration-grid">
          {RELATIVE.map((m) => (
            <button
              key={m}
              className="chip"
              disabled={!due || hasRelative(m)}
              onClick={() => add({ id: uid(), type: 'relative', minutes: m })}
            >
              {m === 0 ? 'On time' : reminderLabel({ id: '', type: 'relative', minutes: m }).replace(' before', '')}
            </button>
          ))}
        </div>
        {!due && <div className="field-hint">Set a date to use relative reminders.</div>}
      </div>
      <div className="pop-section">
        <div className="field-label">At a specific time</div>
        <div className="pop-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <button
            className="icon-btn"
            aria-label="Add reminder"
            disabled={!date || !time}
            onClick={() => add({ id: uid(), type: 'absolute', at: `${date}T${time}` })}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </Popover>
  );
}
