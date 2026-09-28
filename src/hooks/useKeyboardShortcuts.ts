import { useEffect } from 'react';
import { createNewChat } from '../stores/chatStore';
import { closeAllOverlays, focusComposer } from '../stores/uiStore';

/**
 * Global shortcuts, matching the legacy app:
 *   Escape        - close sidebar / open overlays
 *   Ctrl+/        - focus the composer
 *   Ctrl+Shift+N  - new chat
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeAllOverlays();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        focusComposer();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNewChat();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
