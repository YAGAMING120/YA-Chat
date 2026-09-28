/**
 * Artifact side panel: the open file tabs and their active tab.
 * Port of the tab/panel logic in js/artifact.js (data only — rendering
 * lives in components/artifact/ArtifactPanel.tsx).
 */

import type { Artifact, ArtifactMode } from '../types/artifact';
import { createStore, useStore } from '../lib/store';
import { deriveFilename, isPreviewable } from '../lib/artifacts/preview';
import { setSidePanel, uiStore } from './uiStore';

export interface ArtifactState {
  artifacts: Artifact[];
  activeId: string | null;
}

export const artifactStore = createStore<ArtifactState>({
  artifacts: [],
  activeId: null
});

export const useArtifactState = (): ArtifactState => useStore(artifactStore);

let artifactCounter = 0;

export const getActiveArtifact = (): Artifact | null => {
  const { artifacts, activeId } = artifactStore.get();
  return artifacts.find((a) => a.id === activeId) ?? null;
};

/**
 * Open (or add) an artifact tab and show the panel. Previewable types start
 * in Preview mode, like Claude.ai. The Canvas steps aside — only one side
 * panel is ever visible.
 */
export const openArtifact = (code: string, lang: string, suggestedFilename?: string): void => {
  artifactCounter++;
  const normalizedLang = (lang || 'plaintext').toLowerCase();
  const artifact: Artifact = {
    id: `art_${artifactCounter}`,
    filename: suggestedFilename || deriveFilename(lang, artifactCounter),
    lang: normalizedLang,
    code,
    mode: isPreviewable(normalizedLang) ? 'preview' : 'code'
  };
  artifactStore.set((s) => ({ artifacts: [...s.artifacts, artifact], activeId: artifact.id }));
  setSidePanel('artifact');
};

export const switchArtifact = (id: string): void => {
  const { artifacts } = artifactStore.get();
  if (!artifacts.some((a) => a.id === id)) return;
  artifactStore.set({ activeId: id });
};

/** Close one tab; closing the last one shuts the panel (and reveals the Canvas if it wanted the rail). */
export const closeArtifact = (id: string): void => {
  const { artifacts, activeId } = artifactStore.get();
  const remaining = artifacts.filter((a) => a.id !== id);
  if (remaining.length === 0) {
    closeArtifactPanel();
    return;
  }
  artifactStore.set({
    artifacts: remaining,
    activeId: activeId === id ? remaining[remaining.length - 1]!.id : activeId
  });
};

/** Close the whole panel (the × button or the last tab). */
export const closeArtifactPanel = (): void => {
  artifactStore.set({ artifacts: [], activeId: null });
  if (uiStore.get().sidePanel === 'artifact') setSidePanel(null);
};

export const setArtifactMode = (mode: ArtifactMode): void => {
  const { activeId } = artifactStore.get();
  if (!activeId) return;
  artifactStore.set((s) => ({
    artifacts: s.artifacts.map((a) => (a.id === activeId ? { ...a, mode } : a))
  }));
};
