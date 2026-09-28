/**
 * Canvas side panel state — port of js/canvas.js (state + protocol, no DOM).
 *
 * The model opens/updates the canvas by emitting:
 *
 *   <canvas title="..." type="doc|code" lang="js" action="replace|append|prepend">
 *   ...content...
 *   </canvas>
 *
 * Persistence flows through a persister registered by chatStore (avoids a
 * circular import): canvas content is saved on the active session as
 * `canvas` / `canvasWanted`, exactly like the legacy `canvas-change` handler.
 */

import type { CanvasBlock, CanvasDocument } from '../types/canvas';
import { createStore, useStore } from '../lib/store';
import { resolveCanvasType } from '../lib/markdown/canvasBlocks';
import { escapeHTML } from '../lib/escape';
import { setSidePanel, uiStore } from './uiStore';
import { artifactStore } from './artifactStore';

/** Reveal whichever panel belongs on the rail after the canvas hides. */
const revealUnderPanel = (): void => {
  if (uiStore.get().sidePanel !== 'canvas') return;
  setSidePanel(artifactStore.get().artifacts.length > 0 ? 'artifact' : null);
};

export interface CanvasStoreState {
  canvas: CanvasDocument | null;
  wanted: boolean;
  /** Bumped on external updates (model blocks / session restore) so editors can re-apply. */
  revision: number;
}

export const canvasStore = createStore<CanvasStoreState>({
  canvas: null,
  wanted: false,
  revision: 0
});

export const useCanvasState = (): CanvasStoreState => useStore(canvasStore);

/* ── Model instructions ──────────────────────────────────────────────── */

export const CANVAS_INSTRUCTION = `CANVAS mode is ON. The user has a "Canvas" open beside the chat — a panel where they can edit the document or code you write.

To create or update it, include exactly ONE block like this somewhere in your reply:

<canvas title="Short descriptive title" type="doc" action="replace">
the full content goes here
</canvas>

Attributes:
- type: "doc" for rich-text/markdown documents (the default), "code" for source files — for code also add lang="javascript" (or python, html, etc.).
- action: "replace" (default) sets the canvas to exactly what you wrote; "append" adds to the end; "prepend" adds to the start.
- title: shown in the panel header.

Rules:
- Everything between the tags becomes the canvas content. Keep any normal chat prose outside the block.
- Never wrap the block in a code fence and never escape the markdown inside it.
- When the user asks you to edit the canvas, re-send the complete updated content in a new <canvas ... action="replace"> block instead of describing the changes.
- Do not put the block inside a list or heading — put it on its own line.
- Only use this block while canvas mode is on.`;

/** Context block appended to the system prompt while canvas mode is on. */
export const buildCanvasContext = (): string => {
  const { canvas, wanted } = canvasStore.get();
  if (!wanted || !canvas) return '';
  const lang = canvas.type === 'code' ? ` lang="${escapeHTML(canvas.lang || 'plaintext')}"` : '';
  return `<current_canvas title="${escapeHTML(canvas.title || 'Untitled')}" type="${canvas.type}"${lang}>
${canvas.content || ''}
</current_canvas>

The block above is the CURRENT content of the canvas the user is editing. Treat it as the source of truth for any edit they ask for.`;
};

/* ── Persistence (registered by chatStore) ───────────────────────────── */

type Persister = (canvas: CanvasDocument | null, wanted: boolean) => void;
let persist: Persister | null = null;

export const registerCanvasPersister = (fn: Persister): void => {
  persist = fn;
};

const emit = (): void => {
  const { canvas, wanted } = canvasStore.get();
  persist?.(canvas, wanted);
};

/** Legacy scheduleEmit(): user edits debounce 400ms before hitting storage. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleEmit = (): void => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    emit();
  }, 400);
};

/* ── State mutation ──────────────────────────────────────────────────── */

const deriveTitle = (type: 'doc' | 'code', lang: string, content: string): string => {
  if (type === 'doc') {
    const m = /^#\s+(.+)$/m.exec(content || '');
    if (m) return m[1]!.replace(/[*_`]/g, '').trim().slice(0, 70);
    return 'Untitled document';
  }
  return lang ? `${lang} file` : 'Code';
};

export const getCanvasState = (): CanvasDocument | null => {
  const { canvas } = canvasStore.get();
  return canvas ? { ...canvas } : null;
};

export const isCanvasWanted = (): boolean => canvasStore.get().wanted;

/**
 * Show or hide the Canvas panel. Opening it takes over the side rail (the
 * artifact panel steps aside); closing it reveals the artifact panel if it
 * has open tabs.
 */
export const setCanvasWanted = (next: boolean): void => {
  const value = !!next;
  const changed = value !== canvasStore.get().wanted;
  canvasStore.set({ wanted: value });
  if (value) {
    // Always claim the rail — even if the panel was already wanted but the
    // artifact panel had taken it over.
    setSidePanel('canvas');
  } else {
    revealUnderPanel();
  }
  if (changed) emit();
};

/** Apply one <canvas> block emitted by the model. */
export const applyCanvasBlock = (block: CanvasBlock): void => {
  const attrs = block.attrs || {};
  const content = (block.content || '').replace(/^\n+|\n+$/g, '');
  const type = resolveCanvasType(attrs);
  const langAttr = String(attrs.lang || attrs.language || '').toLowerCase();
  const action = String(attrs.action || 'replace').toLowerCase();
  const title = String(attrs.title || '').trim();

  canvasStore.set((s) => {
    const current = s.canvas;
    if (!current || current.type !== type || action === 'replace') {
      const lang = type === 'code' ? langAttr || 'javascript' : 'markdown';
      return {
        canvas: {
          title: title || deriveTitle(type, lang, content),
          type,
          lang,
          content,
          updatedAt: Date.now()
        },
        wanted: s.wanted,
        revision: s.revision + 1
      };
    }

    const next: CanvasDocument = { ...current, updatedAt: Date.now() };
    if (title) next.title = title;
    if (type === 'code' && langAttr) next.lang = langAttr;
    const sep = type === 'code' ? '\n' : '\n\n';
    if (action === 'append') {
      next.content = next.content ? next.content.replace(/\s+$/, '') + sep + content : content;
    } else if (action === 'prepend') {
      next.content = content ? content + sep + next.content.replace(/^\s+/, '') : next.content;
    } else {
      next.content = content;
    }
    return { canvas: next, wanted: s.wanted, revision: s.revision + 1 };
  });

  setCanvasWanted(true);
  emit(); // panel may already have been open — persist the new content right away
};

/** A canvas chip in a chat message was clicked. */
export const openCanvasFromChip = (block: CanvasBlock): void => {
  if (canvasStore.get().canvas) {
    setCanvasWanted(true);
  } else {
    applyCanvasBlock(block);
  }
};

/** Re-hydrate when switching chats (also notifies the persister). */
export const restoreCanvas = (state: CanvasDocument | null | undefined, wanted: boolean): void => {
  canvasStore.set((s) => ({
    canvas: state ? { ...state } : null,
    wanted: !!wanted,
    revision: s.revision + 1
  }));
  if (wanted) setSidePanel('canvas');
  else revealUnderPanel();
  emit();
};

/** User edited the document/source content (immediate state, debounced save). */
export const updateCanvasContent = (content: string): void => {
  const { canvas } = canvasStore.get();
  if (!canvas) return;
  canvasStore.set((s) => ({
    canvas: s.canvas ? { ...s.canvas, content, updatedAt: Date.now() } : null,
    wanted: s.wanted,
    revision: s.revision
  }));
  scheduleEmit();
};

/** Title input committed (blur / Enter). */
export const updateCanvasTitle = (title: string): void => {
  const { canvas } = canvasStore.get();
  if (!canvas) return;
  const finalTitle =
    title.trim() || deriveTitle(canvas.type, canvas.lang, canvas.content);
  canvasStore.set((s) => ({
    canvas: s.canvas ? { ...s.canvas, title: finalTitle } : null,
    wanted: s.wanted,
    revision: s.revision
  }));
  scheduleEmit();
};
