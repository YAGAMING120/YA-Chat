/**
 * State of the in-flight assistant reply (legacy js/chat.js kept this in DOM
 * locals; React renders it from the store instead).
 */

import type { Source } from '../types/chat';
import type { Usage } from '../types/stream';
import { createStore, useStore } from '../lib/store';

export interface StreamState {
  /** A completion request is in flight (the send button is the stop button). */
  active: boolean;
  /** Accumulated assistant text so far (plain — markdown runs once at the end). */
  content: string;
  /** Accumulated reasoning text so far. */
  reasoning: string;
  /** First content token arrived — hide the thinking indicator. */
  started: boolean;
  /** Citations collected from url_citation annotations. */
  sources: Source[];
  usage: Usage | null;
  /** Status line for the server tool currently running (Phase 7). */
  toolLabel: string | null;
  /** Set instead of `active` when the request failed; keeps an error bubble. */
  error: string | null;
}

const IDLE: StreamState = {
  active: false,
  content: '',
  reasoning: '',
  started: false,
  sources: [],
  usage: null,
  toolLabel: null,
  error: null
};

export const streamStore = createStore<StreamState>({ ...IDLE });

export const useStreamState = (): StreamState => useStore(streamStore);

export const getStreamState = (): StreamState => streamStore.get();

/** Start a fresh completion: idle fields, `active` true. */
export const beginStream = (): void => streamStore.set({ ...IDLE, active: true });

/** Merge a throttled flush of the live values. */
export const patchStream = (patch: Partial<StreamState>): void => streamStore.set(patch);

/** Finish normally (success or stop) — hide the live bubble. */
export const endStream = (): void => streamStore.set({ ...IDLE });

/** Fail — keep an error bubble until the next send. */
export const failStream = (error: string): void => streamStore.set({ ...IDLE, error });
