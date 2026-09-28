/** Draft text + pending attachments for the composer (local, never persisted). */

import type { Attachment } from '../types/attachment';
import { createStore, useStore } from '../lib/store';

export interface ComposerState {
  draft: string;
  attachments: Attachment[];
}

export const composerStore = createStore<ComposerState>({
  draft: '',
  attachments: []
});

export const useComposerState = (): ComposerState => useStore(composerStore);

export const setDraft = (draft: string): void => composerStore.set({ draft });

export const addAttachments = (next: Attachment[]): void =>
  composerStore.set((s) => ({ attachments: [...s.attachments, ...next] }));

export const removeAttachment = (index: number): void =>
  composerStore.set((s) => ({ attachments: s.attachments.filter((_, i) => i !== index) }));

export const clearComposer = (): void => composerStore.set({ draft: '', attachments: [] });
