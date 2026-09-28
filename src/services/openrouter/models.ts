import type { ModelEntry, RawModel } from '../../types/model';
import { apiErrorFromResponse, ApiError } from './errors';
import { getHeaders, MODEL_MODALITIES, proxyUrl, readErrorMessage } from './client';

/** Flatten OpenRouter's modality string/arrays into comparable lists. */
const toModalityList = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value) return value.split('+');
  return [];
};

const formatModelName = (id: string): string => {
  const slug = id.includes('/') ? id.split('/').pop() : id;
  return (slug ?? id)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/** OpenRouter free tiers carry the `:free` variant suffix or literally zero pricing. */
const isFreeModel = (m: RawModel): boolean => {
  if (m.id && m.id.endsWith(':free')) return true;
  const p = m.pricing;
  if (!p) return false;
  const prompt = parseFloat(p.prompt ?? '');
  const completion = parseFloat(p.completion ?? '');
  if (Number.isNaN(prompt) || Number.isNaN(completion)) return false;
  return prompt === 0 && completion === 0;
};

/** Slim + enrich a raw /models entry so badges/filters work offline from cache. */
export const toModelEntry = (m: RawModel): ModelEntry => {
  const arch = m.architecture ?? {};
  const modality = arch.modality ?? '';
  // "text+image->text" → input / output halves
  const [inPart = '', outPart = ''] = modality.split('->');
  const input =
    arch.input_modalities && arch.input_modalities.length
      ? arch.input_modalities
      : toModalityList(inPart);
  const output =
    arch.output_modalities && arch.output_modalities.length
      ? arch.output_modalities
      : toModalityList(outPart);

  return {
    id: m.id,
    name: m.name || formatModelName(m.id),
    owned_by: m.id.includes('/') ? (m.id.split('/')[0] as string) : (m.owned_by || 'openrouter'),
    free: isFreeModel(m),
    description: m.description || '',
    input,
    output,
    voices: Array.isArray(m.supported_voices) ? m.supported_voices : [],
    caps: {
      in: input,
      out: output,
      params: Array.isArray(m.supported_parameters)
        ? m.supported_parameters
        : m.supported_parameters && typeof m.supported_parameters === 'object'
          ? Object.keys(m.supported_parameters)
          : [],
      ctx: m.context_length ?? null,
      maxOut: m.top_provider?.max_completion_tokens ?? null
    }
  };
};

/** Free models first, then alphabetical (used for every model list). */
export const sortModels = (a: ModelEntry, b: ModelEntry): number => {
  if (a.free !== b.free) return a.free ? -1 : 1;
  return a.name.localeCompare(b.name);
};

/** GET /models with every modality we filter on. */
export const fetchModels = async (
  apiKey?: string,
  modalities: string = MODEL_MODALITIES
): Promise<ModelEntry[]> => {
  const response = await fetch(proxyUrl('models', { output_modalities: modalities }), {
    method: 'GET',
    headers: getHeaders(apiKey)
  });

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw apiErrorFromResponse(response.status, detail);
  }

  const data = (await response.json()) as { data?: unknown[] };
  return (data.data ?? [])
    .filter((m): m is RawModel => !!m && typeof m === 'object' && 'id' in m && !!(m as RawModel).id)
    .map(toModelEntry)
    .sort(sortModels);
};

export const modelsErrorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.userMessage : 'Failed to fetch models.';
