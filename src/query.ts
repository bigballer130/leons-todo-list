import { addDays, isOverdue, todayISO } from './dates';
import { parseDueText } from './parser';
import { projectDescendants } from './store';
import type { State, Task } from './types';

/**
 * Filter query language:
 *   today, tomorrow, yesterday, overdue / od, no date, recurring, no labels, subtask, all
 *   p1 … p4, no priority
 *   @label (supports * wildcard), #Project, ##Project (incl. sub-projects), /Section
 *   "7 days" / "next 7 days", "due before: <date>", "due after: <date>", "<date>"
 *   search: text
 * combined with  &  |  !  ( )   and  ,  (a comma also means "or")
 */

type Node =
  | { op: 'and' | 'or'; a: Node; b: Node }
  | { op: 'not'; a: Node }
  | { op: 'term'; term: string };

function tokenize(q: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of q) {
    if ('&|!(),'.includes(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      out.push(ch === ',' ? '|' : ch);
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parse(tokens: string[]): Node | null {
  let i = 0;
  const peek = () => tokens[i];
  const orExpr = (): Node | null => {
    let left = andExpr();
    while (peek() === '|') {
      i++;
      const right = andExpr();
      if (left && right) left = { op: 'or', a: left, b: right };
      else left = left ?? right;
    }
    return left;
  };
  const andExpr = (): Node | null => {
    let left = unary();
    while (peek() === '&') {
      i++;
      const right = unary();
      if (left && right) left = { op: 'and', a: left, b: right };
      else left = left ?? right;
    }
    return left;
  };
  const unary = (): Node | null => {
    if (peek() === '!') {
      i++;
      const a = unary();
      return a ? { op: 'not', a } : null;
    }
    if (peek() === '(') {
      i++;
      const e = orExpr();
      if (peek() === ')') i++;
      return e;
    }
    const t = tokens[i++];
    if (t === undefined || '&|)'.includes(t)) return null;
    return { op: 'term', term: t };
  };
  return orExpr();
}

function wildcard(pattern: string) {
  const esc = pattern.replace(/[.+?^${}()[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}$`, 'i');
}

function matchTerm(term: string, t: Task, s: State, today: string): boolean {
  const lower = term.toLowerCase();
  const due = t.due?.date;
  switch (lower) {
    case 'all': return true;
    case 'today': return due === today;
    case 'tomorrow': return due === addDays(today, 1);
    case 'yesterday': return due === addDays(today, -1);
    case 'overdue':
    case 'od': return isOverdue(t.due, today);
    case 'no date': return !t.due;
    case 'no time': return !!t.due && !t.due.time;
    case 'recurring': return !!t.due?.recurrence;
    case 'no labels': return t.labels.length === 0;
    case 'subtask': return !!t.parentId;
    case 'no priority': return t.priority === 4;
  }
  let m: RegExpExecArray | null;
  if ((m = /^p([1-4])$/i.exec(lower))) return t.priority === Number(m[1]);
  if (lower.startsWith('@')) {
    const re = wildcard(term.slice(1));
    return t.labels.some((l) => re.test(l));
  }
  if (lower.startsWith('##')) {
    const re = wildcard(term.slice(2));
    const roots = s.projects.filter((p) => re.test(p.name));
    const ids = new Set(roots.flatMap((p) => [p.id, ...projectDescendants(s.projects, p.id)]));
    return ids.has(t.projectId);
  }
  if (lower.startsWith('#')) {
    const re = wildcard(term.slice(1));
    return s.projects.some((p) => p.id === t.projectId && re.test(p.name));
  }
  if (lower.startsWith('/')) {
    const re = wildcard(term.slice(1));
    return s.sections.some((x) => x.id === t.sectionId && re.test(x.name));
  }
  if ((m = /^(?:next\s+)?(\d+)\s+days?$/.exec(lower))) {
    return !!due && due >= today && due <= addDays(today, Number(m[1]));
  }
  if ((m = /^(?:due\s+)?(before|after):\s*(.+)$/.exec(lower))) {
    const d = parseDueText(m[2]);
    if (!d || !due) return false;
    return m[1] === 'before' ? due < d.date : due > d.date;
  }
  if ((m = /^search:\s*(.+)$/.exec(lower))) {
    return (t.content + ' ' + t.description).toLowerCase().includes(m[1].trim());
  }
  const asDate = parseDueText(term);
  if (asDate) return due === asDate.date;
  return (t.content + ' ' + t.description).toLowerCase().includes(lower);
}

function evalNode(n: Node, t: Task, s: State, today: string): boolean {
  switch (n.op) {
    case 'and': return evalNode(n.a, t, s, today) && evalNode(n.b, t, s, today);
    case 'or': return evalNode(n.a, t, s, today) || evalNode(n.b, t, s, today);
    case 'not': return !evalNode(n.a, t, s, today);
    case 'term': return matchTerm(n.term, t, s, today);
  }
}

export function compileQuery(q: string): ((t: Task, s: State) => boolean) | null {
  const ast = parse(tokenize(q));
  if (!ast) return null;
  return (t, s) => evalNode(ast, t, s, todayISO());
}

export function runQuery(q: string, s: State): Task[] {
  const fn = compileQuery(q);
  if (!fn) return [];
  return s.tasks.filter((t) => !t.completed && fn(t, s));
}
