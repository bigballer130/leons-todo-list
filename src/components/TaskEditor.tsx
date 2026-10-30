import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Calendar, ChevronDown, Flag, Repeat, Send, Tag, X } from 'lucide-react';
import { dueInfo } from '../dates';
import { parseQuickAdd, removeTokensOfType, type Token } from '../parser';
import { useAppState } from '../store';
import type { Draft, Due, Priority } from '../types';
import { DatePopover, LabelPicker, PriorityFlag, PriorityMenu, ProjectIcon, ProjectPicker } from './Pickers';
import { useAnchor } from './Popover';

/** Textarea with an overlay that highlights recognised quick-add tokens. */
export function SmartInput({
  value, onChange, tokens, placeholder, onKeyDown, autoFocus, className,
}: {
  value: string;
  onChange: (v: string) => void;
  tokens: Token[];
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  const parts: Array<{ text: string; type?: string }> = [];
  let pos = 0;
  for (const t of tokens) {
    if (t.start < pos) continue;
    if (t.start > pos) parts.push({ text: value.slice(pos, t.start) });
    parts.push({ text: value.slice(t.start, t.end), type: t.type });
    pos = t.end;
  }
  parts.push({ text: value.slice(pos) });

  return (
    <div className={`smart-input ${className ?? ''}`}>
      <div className="smart-mirror" aria-hidden>
        {parts.map((p, i) => (p.type ? <mark key={i} className={`tok tok-${p.type}`}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
        {'​'}
      </div>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={onKeyDown}
        spellCheck
      />
    </div>
  );
}

export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const { minRows = 1, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...rest} />;
}

export function DueChipLabel({ due }: { due: Due }) {
  const info = dueInfo(due);
  return (
    <span className={`due-${info.tone}`}>
      {info.label}
      {due.recurrence && <Repeat size={12} style={{ marginLeft: 4, verticalAlign: -1 }} />}
    </span>
  );
}

interface TaskEditorProps {
  initial: Draft;
  mode: 'add' | 'edit';
  onSubmit: (d: Draft) => void;
  onCancel: () => void;
  variant?: 'inline' | 'modal' | 'card';
  /** keep focus & reset after adding (inline add) */
  keepOpen?: boolean;
}

export function TaskEditor({ initial, mode, onSubmit, onCancel, variant = 'inline', keepOpen }: TaskEditorProps) {
  const s = useAppState();
  const [content, setContent] = useState(initial.content);
  const [description, setDescription] = useState(initial.description);
  const [due, setDue] = useState<Due | null>(initial.due);
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [labels, setLabels] = useState<string[]>(initial.labels);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [sectionId, setSectionId] = useState<string | null>(initial.sectionId);
  const [ignore, setIgnore] = useState<string[]>([]);
  const [dirty, setDirty] = useState(mode === 'add');
  const [resetKey, setResetKey] = useState(0);

  const [dateA, openDate, closeDate] = useAnchor();
  const [prioA, openPrio, closePrio] = useAnchor();
  const [labelA, openLabel, closeLabel] = useAnchor();
  const [projA, openProj, closeProj] = useAnchor();

  const parsed = useMemo(
    () =>
      dirty
        ? parseQuickAdd(content, {
            projects: s.projects,
            sections: s.sections,
            labels: s.labels,
            weekStart: s.settings.weekStart,
            smartDate: s.settings.smartDate,
            currentProjectId: projectId,
            ignore,
          })
        : null,
    [dirty, content, s.projects, s.sections, s.labels, s.settings.weekStart, s.settings.smartDate, projectId, ignore],
  );

  const eff = {
    due: parsed?.due ?? due,
    priority: parsed?.priority ?? priority,
    labels: [...new Set([...labels, ...(parsed?.labels ?? [])])],
    projectId: parsed?.projectId ?? projectId,
    sectionId: parsed?.projectId || parsed?.sectionId ? parsed?.sectionId ?? null : sectionId,
  };
  const project = s.projects.find((p) => p.id === eff.projectId) ?? s.projects.find((p) => p.isInbox)!;
  const section = s.sections.find((x) => x.id === eff.sectionId);
  const finalContent = parsed ? parsed.content : content.trim();

  const stripTypes = (types: Token['type'][]) => {
    if (parsed) setContent(removeTokensOfType(content, parsed.tokens, types) + ' ');
  };

  const submit = () => {
    if (!finalContent.trim()) return;
    onSubmit({
      content: finalContent,
      description: description.trim(),
      due: eff.due,
      priority: eff.priority,
      labels: eff.labels,
      projectId: project.id,
      sectionId: eff.sectionId,
      parentId: project.id === initial.projectId ? initial.parentId : null,
    });
    if (keepOpen) {
      setContent('');
      setDescription('');
      setIgnore([]);
      setDue(initial.due);
      setPriority(initial.priority);
      setLabels(initial.labels);
      setResetKey((k) => k + 1);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      (e.nativeEvent as Event & { _handled?: boolean })._handled = true;
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className={`task-editor te-${variant}`} onClick={(e) => e.stopPropagation()}>
      <div className="te-fields">
        <SmartInput
          key={resetKey}
          className="te-title"
          value={content}
          onChange={(v) => {
            setContent(v);
            setDirty(true);
          }}
          tokens={parsed?.tokens ?? []}
          placeholder={mode === 'add' ? 'Task name' : 'Task name'}
          onKeyDown={onKey}
          autoFocus
        />
        <AutoTextarea
          className="te-desc"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              (e.nativeEvent as Event & { _handled?: boolean })._handled = true;
              onCancel();
            }
          }}
        />
        <div className="te-chips">
          <button className={`chip ${eff.due ? 'active' : ''}`} onClick={(e) => openDate(e.currentTarget)}>
            <Calendar size={14} className={eff.due ? `due-${dueInfo(eff.due).tone}` : ''} />
            {eff.due ? <DueChipLabel due={eff.due} /> : 'Date'}
            {eff.due && (
              <span
                className="chip-x"
                role="button"
                aria-label="Remove date"
                onClick={(e) => {
                  e.stopPropagation();
                  if (parsed?.due) setIgnore((i) => [...i, ...parsed.tokens.filter((t) => t.type === 'date').map((t) => t.text)]);
                  setDue(null);
                }}
              >
                <X size={12} />
              </span>
            )}
          </button>
          <button className={`chip ${eff.priority < 4 ? 'active' : ''}`} onClick={(e) => openPrio(e.currentTarget)}>
            {eff.priority < 4 ? <PriorityFlag p={eff.priority} size={14} /> : <Flag size={14} />}
            {eff.priority < 4 ? `P${eff.priority}` : 'Priority'}
          </button>
          <button className={`chip ${eff.labels.length ? 'active' : ''}`} onClick={(e) => openLabel(e.currentTarget)}>
            <Tag size={14} />
            {eff.labels.length ? eff.labels.join(', ') : 'Labels'}
          </button>
        </div>
      </div>
      <div className="te-footer">
        <button className="te-project" onClick={(e) => openProj(e.currentTarget)}>
          <ProjectIcon project={project} size={14} />
          <span>{project.name}{section ? ` / ${section.name}` : ''}</span>
          <ChevronDown size={14} />
        </button>
        <div className="te-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!finalContent.trim()} onClick={submit}>
            <span className="hide-mobile">{mode === 'add' ? 'Add task' : 'Save'}</span>
            <Send size={16} className="show-mobile" />
          </button>
        </div>
      </div>

      {dateA && (
        <DatePopover
          anchor={dateA}
          value={eff.due}
          onClose={closeDate}
          onChange={(d) => {
            stripTypes(['date']);
            setDue(d);
          }}
        />
      )}
      {prioA && (
        <PriorityMenu
          anchor={prioA}
          value={eff.priority}
          onClose={closePrio}
          onChange={(p) => {
            stripTypes(['priority']);
            setPriority(p);
          }}
        />
      )}
      {labelA && (
        <LabelPicker
          anchor={labelA}
          value={eff.labels}
          onClose={closeLabel}
          onChange={(l) => {
            stripTypes(['label']);
            setLabels(l);
          }}
        />
      )}
      {projA && (
        <ProjectPicker
          anchor={projA}
          projectId={eff.projectId}
          sectionId={eff.sectionId}
          onClose={closeProj}
          onChange={(p, sec) => {
            stripTypes(['project', 'section']);
            setProjectId(p);
            setSectionId(sec);
          }}
        />
      )}
    </div>
  );
}
