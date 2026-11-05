import { addDays, pad } from './dates';
import type { State, Task } from './types';

/** Build an iCalendar file of every open task that has a date (and deadlines), for importing into a calendar app. */
export function buildICS(s: State): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  const day = (d: string) => d.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//Leon's Planner//EN", 'CALSCALE:GREGORIAN'];
  const project = (t: Task) => s.projects.find((p) => p.id === t.projectId)?.name ?? '';
  for (const t of s.tasks) {
    if (t.completed) continue;
    if (t.due) {
      lines.push('BEGIN:VEVENT', `UID:${t.id}@leons-planner`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(t.content)}`);
      if (t.due.time) {
        const [h, m] = t.due.time.split(':').map(Number);
        const end = h * 60 + m + (t.duration ?? 30);
        const endDate = end >= 1440 ? addDays(t.due.date, 1) : t.due.date;
        lines.push(
          `DTSTART:${day(t.due.date)}T${pad(h)}${pad(m)}00`,
          `DTEND:${day(endDate)}T${pad(Math.floor(end / 60) % 24)}${pad(end % 60)}00`,
        );
      } else {
        lines.push(`DTSTART;VALUE=DATE:${day(t.due.date)}`, `DTEND;VALUE=DATE:${day(addDays(t.due.date, 1))}`);
      }
      const r = t.due.recurrence;
      if (r) {
        const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        if (r.workdays) lines.push('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
        else if (r.weekdays?.length) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${r.weekdays.map((d) => byday[d]).join(',')}`);
        else lines.push(`RRULE:FREQ=${({ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const)[r.freq]};INTERVAL=${r.interval}`);
      }
      const desc = [t.description, project(t) && `Project: ${project(t)}`].filter(Boolean).join('\n');
      if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
      lines.push('END:VEVENT');
    }
    if (t.deadline) {
      lines.push(
        'BEGIN:VEVENT', `UID:${t.id}-deadline@leons-planner`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(`Deadline: ${t.content}`)}`,
        `DTSTART;VALUE=DATE:${day(t.deadline)}`, `DTEND;VALUE=DATE:${day(addDays(t.deadline, 1))}`, 'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
