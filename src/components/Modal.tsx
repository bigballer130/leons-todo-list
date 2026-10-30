import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { popoverOpen } from './Popover';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
  title?: ReactNode;
  footer?: ReactNode;
  top?: boolean;
}

const modalStack: number[] = [];
let mid = 0;

export function Modal({ onClose, children, width = 450, className, title, footer, top }: ModalProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  const downOnOverlay = useRef(false);

  useEffect(() => {
    const id = ++mid;
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || popoverOpen() || modalStack[modalStack.length - 1] !== id) return;
      // inputs with their own escape handling (inline editors) mark the event
      if ((e as KeyboardEvent & { _handled?: boolean })._handled) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prevFocus = document.activeElement as HTMLElement | null;
    return () => {
      modalStack.splice(modalStack.indexOf(id), 1);
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className={`overlay ${top ? 'overlay-top' : ''}`}
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) onClose();
        downOnOverlay.current = false;
      }}
    >
      <div ref={panel} className={`modal ${className ?? ''}`} style={{ maxWidth: width }} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export const modalIsOpen = () => modalStack.length > 0;
