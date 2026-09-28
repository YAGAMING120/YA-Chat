import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** e.g. '28rem' (default) or '560px' */
  maxWidth?: string;
  className?: string;
  bodyClassName?: string;
  /** Legacy id for the close button (e.g. 'btn-close-settings'). */
  closeId?: string;
  /** Legacy id for the overlay itself (e.g. 'modal-settings'). */
  overlayId?: string;
}

/** Shared overlay dialog matching the legacy `.modal` styling. */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth,
  className,
  bodyClassName,
  closeId,
  overlayId
}: ModalProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div
      id={overlayId}
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn('modal', className)}
        style={maxWidth ? { maxWidth } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            id={closeId}
            className="btn-icon btn-close-modal"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="icon">
              <use href="#icon-plus" style={{ transform: 'rotate(45deg)' }} />
            </svg>
          </button>
        </div>
        <div className={cn('modal__body', bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
