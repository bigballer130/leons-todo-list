import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

const stack: number[] = [];
let nextId = 0;

/** True when any popover is open (used so Escape closes the popover, not the modal under it). */
export const popoverOpen = () => stack.length > 0;

interface PopoverProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'start' | 'end';
  className?: string;
}

export function Popover({ anchor, onClose, children, width, align = 'start', className }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const idRef = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = ++nextId;
    idRef.current = id;
    stack.push(id);
    const isTop = () => stack[stack.length - 1] === id;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!isTop()) return;
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTop()) {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor]);

  useLayoutEffect(() => {
    const place = () => {
      if (!ref.current || !anchor) return;
      const a = anchor.getBoundingClientRect();
      const p = ref.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === 'end' ? a.right - p.width : a.left;
      left = Math.max(8, Math.min(left, vw - p.width - 8));
      let top = a.bottom + 4;
      if (top + p.height > vh - 8) {
        const above = a.top - p.height - 4;
        top = above >= 8 ? above : Math.max(8, vh - p.height - 8);
      }
      setPos({ top, left });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align]);

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className ?? ''}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, visibility: pos ? 'visible' : 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  hint?: string;
  divider?: boolean;
  custom?: ReactNode;
  keepOpen?: boolean;
}

export function Menu({
  anchor, onClose, items, width = 250, align,
}: { anchor: HTMLElement | null; onClose: () => void; items: MenuItem[]; width?: number; align?: 'start' | 'end' }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={width} align={align}>
      <div className="menu" role="menu">
        {items.map((it, i) =>
          it.divider ? (
            <div key={i} className="menu-divider" />
          ) : it.custom ? (
            <div key={i} className="menu-custom">{it.custom}</div>
          ) : (
            <button
              key={i}
              role="menuitem"
              className={`menu-item ${it.danger ? 'danger' : ''}`}
              onClick={() => {
                it.onClick?.();
                if (!it.keepOpen) onClose();
              }}
            >
              <span className="menu-icon">{it.icon}</span>
              <span className="menu-label">{it.label}</span>
              {it.hint && <span className="menu-hint">{it.hint}</span>}
              {it.checked && <Check size={16} className="menu-check" />}
            </button>
          ),
        )}
      </div>
    </Popover>
  );
}

/** Small hook: `const [anchor, open, close] = useAnchor()` */
export function useAnchor<T extends HTMLElement = HTMLElement>() {
  const [anchor, setAnchor] = useState<T | null>(null);
  return [anchor, (el: T | null) => setAnchor(el), () => setAnchor(null)] as const;
}
