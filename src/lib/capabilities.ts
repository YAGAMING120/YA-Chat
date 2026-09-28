/**
 * Model capability lookup — deliberately dependency-free so it can be
 * imported from anywhere without import cycles (ported from js/capabilities.js).
 *
 * The catalog itself now lives in the models store; this module only holds
 * pure builders and predicates.
 */

import type { ModelCapability, ModelCaps, ModelEntry, RawModel } from '../types/model';

export type ModelLike = ModelEntry | RawModel;

const normalizeParams = (sp: string[] | Record<string, unknown> | undefined): string[] => {
  if (Array.isArray(sp)) return sp;
  if (sp && typeof sp === 'object') return Object.keys(sp);
  return [];
};

const hasCaps = (m: ModelLike): m is ModelEntry => 'caps' in m && Array.isArray(m.caps?.out);

/**
 * Build the capability catalog from either raw /models entries or the slim
 * shape we cache in localStorage.
 */
export const buildCatalog = (models: ModelLike[]): Map<string, ModelCapability> => {
  const next = new Map<string, ModelCapability>();
  models.forEach((m) => {
    if (!m || !m.id) return;
    if (hasCaps(m)) {
      const caps: ModelCaps = m.caps;
      next.set(m.id, {
        id: m.id,
        name: m.name || m.id,
        input: caps.in,
        output: caps.out,
        params: caps.params,
        contextLength: caps.ctx,
        maxCompletionTokens: caps.maxOut
      });
      return;
    }
    const raw = m as RawModel;
    const caps = raw as { caps?: ModelCaps };
    const stored = caps.caps;
    next.set(raw.id, {
      id: raw.id,
      name: raw.name || raw.id,
      input: stored?.in || raw.architecture?.input_modalities || ['text'],
      output: stored?.out || raw.architecture?.output_modalities || ['text'],
      params: stored?.params || normalizeParams(raw.supported_parameters),
      contextLength: stored?.ctx ?? raw.context_length ?? null,
      maxCompletionTokens: stored?.maxOut ?? raw.top_provider?.max_completion_tokens ?? null
    });
  });
  return next;
};

export const getMeta = (
  catalog: Map<string, ModelCapability>,
  id: string | null | undefined
): ModelCapability | null => (id ? catalog.get(id) ?? null : null);

export const supportsInput = (
  meta: ModelCapability | null | undefined,
  modality: string
): boolean => !!meta && meta.input.includes(modality);

export const supportsOutput = (
  meta: ModelCapability | null | undefined,
  modality: string
): boolean => !!meta && meta.output.includes(modality);

export const supportsParam = (
  meta: ModelCapability | null | undefined,
  param: string
): boolean => !meta || meta.params.includes(param);

export const canReadImages = (meta: ModelCapability | null | undefined): boolean =>
  supportsInput(meta, 'image');

export const canGenerateImages = (meta: ModelCapability | null | undefined): boolean =>
  supportsOutput(meta, 'image');

/** Models whose output includes speech (via /audio/speech) or audio. */
export const canSpeak = (meta: ModelCapability | null | undefined): boolean =>
  supportsOutput(meta, 'speech') || supportsOutput(meta, 'audio');

/**
 * Can this model produce a normal chat reply? Text is the only chat output.
 * Unknown models (not in the catalog) are assumed capable so we never block a
 * request just because the catalog failed to load.
 */
export const canChat = (meta: ModelCapability | null | undefined): boolean =>
  !meta || supportsOutput(meta, 'text');

/** A model that can read PDFs through OpenRouter's file parser (all of them can). */
export const canReadFiles = (): boolean => true;

export interface SamplingSettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Auto mode (default) lets the model/provider pick its own sampling values. */
  autoParams?: boolean;
}

/**
 * Resolve the sampling parameters for one request.
 *
 * Auto mode (default) lets the model decide: temperature / top-p are omitted so
 * the provider applies its own tuned defaults, and max_tokens is taken from the
 * model's declared maximum output. Manual mode sends the user's values, but
 * drops any parameter the current model does not support.
 *
 * NOTE: carried forward from the legacy app (unused there as well) — kept as a
 * pure helper for a future "Auto sampling" setting.
 */
export const resolveParams = (
  settings: SamplingSettings,
  meta: ModelCapability | null
): Record<string, number> => {
  const params: Record<string, number> = {};
  const auto = settings.autoParams !== false;

  if (auto) {
    const maxOut = meta?.maxCompletionTokens ?? null;
    if (typeof maxOut === 'number' && Number.isFinite(maxOut)) {
      params.max_tokens = Math.min(Math.max(maxOut, 1024), 1048576);
    }
    return params;
  }

  if (supportsParam(meta, 'temperature')) params.temperature = settings.temperature;
  if (supportsParam(meta, 'top_p')) params.top_p = settings.topP;
  if (supportsParam(meta, 'max_tokens')) params.max_tokens = settings.maxTokens;
  return params;
};

/** Human readable summary of what resolveParams() will do for this model. */
export const describeParams = (
  settings: SamplingSettings,
  meta: ModelCapability | null
): string => {
  const label = meta ? meta.name : 'selected model';
  if (settings.autoParams === false) {
    const dropped = ['temperature', 'top_p', 'max_tokens'].filter(
      (p) => !supportsParam(meta, p)
    );
    let text = `Manual · sending temperature ${settings.temperature}, top-p ${settings.topP}, max tokens ${settings.maxTokens}`;
    if (dropped.length) text += ` (${dropped.join(', ')} dropped — not supported by ${label})`;
    return text;
  }
  const completionMax = meta?.maxCompletionTokens;
  const maxOut =
    typeof completionMax === 'number' && Number.isFinite(completionMax)
      ? Math.min(Math.max(completionMax, 1024), 1048576).toLocaleString()
      : 'provider default';
  return `Auto · following ${label}: temperature and top-p from the provider, max tokens ${maxOut}`;
};
