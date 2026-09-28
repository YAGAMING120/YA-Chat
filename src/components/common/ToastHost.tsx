import { useEffect, useState } from 'react';
import type { ToastItem } from '../../stores/uiStore';
import { useUiState } from '../../stores/uiStore';
import { cn } from '../../lib/cn';

function Toast({ toast }: { toast: ToastItem }): JSX.Element {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn(
        'toast',
        `toast--${toast.type}`,
        (visible && !toast.closing) && 'show'
      )}
    >
      <div style={{ flex: 1 }}>{toast.message}</div>
    </div>
  );
}

export function ToastHost(): JSX.Element {
  const { toasts } = useUiState();
  return (
    <div id="toast-container" className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
