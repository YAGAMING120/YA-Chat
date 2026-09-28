import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface InlineConfirmProps {
  message: string;
  onConfirm: () => void;
  children: (ctrl: { open: boolean; requestOpen: () => void }) => ReactNode;
}

/**
 * Wraps an action button: clicking it pops up a "Yes / No" confirmation
 * anchored below the button (replaces the legacy inline-confirm popup).
 */
export function InlineConfirm({
  message,
  onConfirm,
  children
}: InlineConfirmProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const confirm = (): void => {
    setOpen(false);
    onConfirm();
  };

  return (
    <div ref={rootRef} className="relative">
      {children({ open, requestOpen: () => setOpen(true) })}
      {open && (
        <div id="inline-confirm-popup" className="inline-confirm">
          <span className="inline-confirm__msg">{message}</span>
          <button type="button" className="inline-confirm__yes" onClick={confirm}>
            Yes
          </button>
          <button type="button" className="inline-confirm__no" onClick={() => setOpen(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

interface ConfirmButtonProps {
  title: string;
  message: string;
  onConfirm: () => void;
  className?: string;
  children: ReactNode;
}

/** Icon button that asks for confirmation before running its action. */
export function ConfirmButton({
  title,
  message,
  onConfirm,
  className,
  children
}: ConfirmButtonProps): JSX.Element {
  return (
    <InlineConfirm
      message={message}
      onConfirm={onConfirm}
    >
      {({ requestOpen }) => (
        <button
          type="button"
          title={title}
          aria-label={title}
          className={cn('btn-icon', className)}
          onClick={(e) => {
            e.stopPropagation();
            requestOpen();
          }}
        >
          {children}
        </button>
      )}
    </InlineConfirm>
  );
}
