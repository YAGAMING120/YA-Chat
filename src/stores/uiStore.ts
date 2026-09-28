import { createStore, useStore } from '../lib/store';

export type ToastType = 'info' | 'error' | 'success';

/**
 * Which side panel is visible. The artifact panel and the Canvas share the
 * right-hand rail — only one can be shown at a time (the legacy app let both
 * open at once and their margins stacked; this is the approved fix).
 */
export type SidePanelKind = 'artifact' | 'canvas' | null;

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  closing: boolean;
}

export interface UiState {
  /** Mobile sidebar drawer */
  sidebarOpen: boolean;
  settingsOpen: boolean;
  modelsOpen: boolean;
  ttsOpen: boolean;
  /** Text seeded into the TTS modal the next time it opens. */
  ttsText: string;
  /** Preferred speech model id seeded on open (from the model picker). */
  ttsModelId: string | null;
  /** Bumped on every openTts() so the modal can re-seed itself. */
  ttsSeq: number;
  /** Tools popover above the composer. */
  toolsOpen: boolean;
  /** Vertical tools menu revealed by the composer's "+" button. */
  composerTools: boolean;
  /** Visible side panel: artifact files, the Canvas, or neither. */
  sidePanel: SidePanelKind;
  toasts: ToastItem[];
  /** Bumped to ask the composer to focus itself. */
  composerFocusTick: number;
}

export const uiStore = createStore<UiState>({
  sidebarOpen: false,
  settingsOpen: false,
  modelsOpen: false,
  ttsOpen: false,
  ttsText: '',
  ttsModelId: null,
  ttsSeq: 0,
  toolsOpen: false,
  composerTools: false,
  sidePanel: null,
  toasts: [],
  composerFocusTick: 0
});

export const useUiState = (): UiState => useStore(uiStore);

/* ── Sidebar (mobile drawer) ─────────────────────────────────────────── */

export const openSidebar = (): void => uiStore.set({ sidebarOpen: true });
export const closeSidebar = (): void => uiStore.set({ sidebarOpen: false });
export const toggleSidebar = (): void =>
  uiStore.set((s) => ({ sidebarOpen: !s.sidebarOpen }));

/* ── Modals ──────────────────────────────────────────────────────────── */

export const openSettings = (): void => uiStore.set({ settingsOpen: true });
export const closeSettings = (): void => uiStore.set({ settingsOpen: false });
export const openModels = (): void => uiStore.set({ modelsOpen: true });
export const closeModels = (): void => uiStore.set({ modelsOpen: false });
/** Open the TTS modal, seeding it with text (and optionally a voice model). */
export const openTts = (text = '', modelId: string | null = null): void =>
  uiStore.set((s) => ({ ttsOpen: true, ttsText: text, ttsModelId: modelId, ttsSeq: s.ttsSeq + 1 }));
export const closeTts = (): void => uiStore.set({ ttsOpen: false, ttsModelId: null });

export const openTools = (): void => uiStore.set({ toolsOpen: true });
export const closeTools = (): void => uiStore.set({ toolsOpen: false });
export const toggleTools = (): void => uiStore.set((s) => ({ toolsOpen: !s.toolsOpen }));

export const openComposerTools = (): void => uiStore.set({ composerTools: true });
export const closeComposerTools = (): void => uiStore.set({ composerTools: false });
export const toggleComposerTools = (): void =>
  uiStore.set((s) => ({ composerTools: !s.composerTools }));

/* ── Side panels (artifact / canvas) ─────────────────────────────────── */

export const setSidePanel = (next: SidePanelKind): void => uiStore.set({ sidePanel: next });

export const closeAllOverlays = (): void =>
  uiStore.set({
    sidebarOpen: false,
    settingsOpen: false,
    modelsOpen: false,
    ttsOpen: false,
    toolsOpen: false,
    composerTools: false
  });

/* ── Toasts ──────────────────────────────────────────────────────────── */

let toastCounter = 0;

export const showToast = (message: string, type: ToastType = 'info'): void => {
  const id = ++toastCounter;
  uiStore.set((s) => ({
    toasts: [...s.toasts, { id, message, type, closing: false }]
  }));
  setTimeout(() => {
    uiStore.set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, closing: true } : t))
    }));
    setTimeout(() => {
      uiStore.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 320);
  }, 4000);
};

/* ── Composer focus ──────────────────────────────────────────────────── */

export const focusComposer = (): void =>
  uiStore.set((s) => ({ composerFocusTick: s.composerFocusTick + 1 }));
