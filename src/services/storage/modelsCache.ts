import type { ModelEntry } from '../../types/model';
import { getFromStorage, saveToStorage } from './local';

export const MODELS_CACHE_KEY = 'or_models_cache_v3';
export const MODELS_CACHE_TIME_KEY = 'or_models_cache_time';
export const SELECTED_MODEL_KEY = 'or_selected_model';

export const CACHE_TTL = 3_600_000; // 1 hour

/** OpenRouter's free-model router: always free, routes to an available free model. */
export const DEFAULT_MODEL = 'openrouter/free';

export const readModelsCache = (): ModelEntry[] | null => {
  const cachedTime = getFromStorage<number>(MODELS_CACHE_TIME_KEY, 0) ?? 0;
  if (Date.now() - cachedTime >= CACHE_TTL) return null;
  const cached = getFromStorage<ModelEntry[]>(MODELS_CACHE_KEY, []);
  return cached && cached.length > 0 ? cached : null;
};

export const writeModelsCache = (models: ModelEntry[]): void => {
  saveToStorage(MODELS_CACHE_KEY, models);
  saveToStorage(MODELS_CACHE_TIME_KEY, Date.now());
};

export const readSelectedModelId = (): string | null =>
  getFromStorage<string>(SELECTED_MODEL_KEY);

export const writeSelectedModelId = (id: string): void =>
  saveToStorage(SELECTED_MODEL_KEY, id);
