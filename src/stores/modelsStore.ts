import type { ModelCapability, ModelEntry } from '../types/model';
import {
  DEFAULT_MODEL,
  readModelsCache,
  readSelectedModelId,
  writeModelsCache,
  writeSelectedModelId
} from '../services/storage/modelsCache';
import { fetchModels, modelsErrorMessage } from '../services/openrouter/models';
import { buildCatalog, canChat, getMeta } from '../lib/capabilities';
import { createStore, useStore } from '../lib/store';
import { getApiKey } from './settingsStore';
import { showToast } from './uiStore';

export interface ModelsState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  models: ModelEntry[];
  catalog: Map<string, ModelCapability>;
  selectedId: string;
}

export const modelsStore = createStore<ModelsState>({
  loaded: false,
  loading: false,
  error: null,
  models: [],
  catalog: new Map(),
  selectedId: DEFAULT_MODEL
});

export const useModelsState = (): ModelsState => useStore(modelsStore);

/* ── Selection ───────────────────────────────────────────────────────── */

/**
 * Fall back to a free chat model if the stored pick no longer exists or can't
 * chat (embeddings / rerank / decisions models are not chat models).
 */
const ensureValidSelection = (
  models: ModelEntry[],
  catalog: Map<string, ModelCapability>,
  current: string | null
): string => {
  if (models.length === 0) return current || DEFAULT_MODEL;

  const usable = (id: string): boolean => canChat(getMeta(catalog, id));
  if (current && usable(current)) return current;

  const preferred =
    models.find((m) => m.id === DEFAULT_MODEL && usable(m.id)) ||
    models.find((m) => usable(m.id)) ||
    models.find((m) => m.id === DEFAULT_MODEL) ||
    models[0];

  if (!preferred) return current || DEFAULT_MODEL;
  writeSelectedModelId(preferred.id);
  return preferred.id;
};

const adopt = (models: ModelEntry[], current: string | null): string => {
  const catalog = buildCatalog(models);
  const selectedId = ensureValidSelection(models, catalog, current);
  modelsStore.set({ models, catalog, selectedId, loaded: true, loading: false, error: null });
  return selectedId;
};

export const selectModel = (id: string): void => {
  writeSelectedModelId(id);
  modelsStore.set({ selectedId: id });
};

/* ── Loading (1 hour cache, then network) ────────────────────────────── */

export const initModels = async (): Promise<void> => {
  const storedSelection = readSelectedModelId();
  const cached = readModelsCache();

  if (cached) {
    adopt(cached, storedSelection);
    return;
  }

  modelsStore.set({ loading: true, error: null });
  try {
    const models = await fetchModels(getApiKey());
    writeModelsCache(models);
    adopt(models, storedSelection);
  } catch (e) {
    console.error('Failed to load models list', e);
    modelsStore.set({
      loading: false,
      error: modelsErrorMessage(e),
      loaded: true
    });
    showToast('Failed to fetch models. Check your OpenRouter API key.', 'error');
  }
};

/** Refetch regardless of cache age (used by a manual retry). */
export const reloadModels = async (): Promise<void> => {
  modelsStore.set({ loading: true, error: null });
  try {
    const models = await fetchModels(getApiKey());
    writeModelsCache(models);
    adopt(models, readSelectedModelId());
  } catch (e) {
    modelsStore.set({ loading: false, error: modelsErrorMessage(e) });
    showToast(modelsErrorMessage(e), 'error');
  }
};

/* ── Read helpers ────────────────────────────────────────────────────── */

export const getModels = (): ModelEntry[] => modelsStore.get().models;
export const getSelectedModelId = (): string => modelsStore.get().selectedId;
export const getModelEntry = (id: string): ModelEntry | null =>
  modelsStore.get().models.find((m) => m.id === id) ?? null;
export const getSelectedMeta = (): ModelCapability | null =>
  getMeta(modelsStore.get().catalog, modelsStore.get().selectedId);

/** Free (and paid) speech models, free first — used by the TTS modal. */
export const getSpeechModels = (): ModelEntry[] =>
  modelsStore
    .get()
    .models.filter((m) => m.output.includes('speech') || m.output.includes('audio'))
    .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));

/** Image-output models, free first — used by the image generation tool. */
export const getImageModels = (): ModelEntry[] =>
  modelsStore
    .get()
    .models.filter((m) => m.output.includes('image'))
    .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
