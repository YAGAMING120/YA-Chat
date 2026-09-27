/**
 * Model capability lookup shared by settings, chat, and the model picker.
 *
 * Deliberately dependency-free so it can be imported from anywhere without
 * creating an import cycle (settings -> models -> api -> settings).
 */

let catalog = new Map();
let selectedId = null;
const listeners = new Set();

const normalizeParams = (sp) => {
    if (Array.isArray(sp)) return sp;
    if (sp && typeof sp === 'object') return Object.keys(sp);
    return [];
};

/** Accepts both raw /models entries and the slim shape we cache in localStorage */
export const setCatalog = (models) => {
    const next = new Map();
    (models || []).forEach(m => {
        if (!m || !m.id) return;
        const caps = m.caps || {};
        next.set(m.id, {
            id: m.id,
            name: m.name || m.id,
            input: caps.in || m.architecture?.input_modalities || ['text'],
            output: caps.out || m.architecture?.output_modalities || ['text'],
            params: caps.params || normalizeParams(m.supported_parameters),
            contextLength: caps.ctx ?? m.context_length ?? null,
            maxCompletionTokens: caps.maxOut ?? m.top_provider?.max_completion_tokens ?? null
        });
    });
    catalog = next;
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
};

export const getMeta = (id) => catalog.get(id) || null;

export const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

/** Kept in sync by models.js so other modules can read the pick without importing it */
export const setSelected = (id) => {
    if (selectedId === id) return;
    selectedId = id;
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
};

export const getSelectedId = () => selectedId;
export const getSelectedMeta = () => getMeta(selectedId);

export const supportsInput = (meta, modality) => !!meta && meta.input.includes(modality);
export const supportsOutput = (meta, modality) => !!meta && meta.output.includes(modality);
export const supportsParam = (meta, param) => !meta || meta.params.includes(param);

export const canReadImages = (meta) => supportsInput(meta, 'image');
export const canGenerateImages = (meta) => supportsOutput(meta, 'image');

/** Models whose output includes speech (via /audio/speech) or audio */
export const canSpeak = (meta) => supportsOutput(meta, 'speech') || supportsOutput(meta, 'audio');

/**
 * Can this model produce a normal chat reply? Text is the only chat output.
 * Unknown models (not in the catalog) are assumed capable so we never block a
 * request just because the catalog failed to load.
 */
export const canChat = (meta) => !meta || supportsOutput(meta, 'text');

/** A model that can read PDFs through OpenRouter's file parser (all of them can) */
export const canReadFiles = () => true;

/**
 * Resolve the sampling parameters for one request.
 *
 * Auto mode (default) lets the model decide: temperature / top-p are omitted so
 * the provider applies its own tuned defaults, and max_tokens is taken from the
 * model's declared maximum output. Manual mode sends the user's values, but
 * drops any parameter the current model does not support.
 */
export const resolveParams = (settings, meta) => {
    const params = {};
    const auto = settings.autoParams !== false;

    if (auto) {
        const maxOut = meta && Number.isFinite(meta.maxCompletionTokens)
            ? meta.maxCompletionTokens
            : null;
        if (maxOut) params.max_tokens = Math.min(Math.max(maxOut, 1024), 1048576);
        return params;
    }

    if (supportsParam(meta, 'temperature')) params.temperature = settings.temperature;
    if (supportsParam(meta, 'top_p')) params.top_p = settings.topP;
    if (supportsParam(meta, 'max_tokens')) params.max_tokens = settings.maxTokens;
    return params;
};

/** Human readable summary of what resolveParams() will do for this model */
export const describeParams = (settings, meta) => {
    const label = meta ? meta.name : 'selected model';
    if (settings.autoParams === false) {
        const dropped = ['temperature', 'top_p', 'max_tokens']
            .filter(p => !supportsParam(meta, p));
        let text = `Manual · sending temperature ${settings.temperature}, top-p ${settings.topP}, max tokens ${settings.maxTokens}`;
        if (dropped.length) text += ` (${dropped.join(', ')} dropped — not supported by ${label})`;
        return text;
    }
    const maxOut = meta && Number.isFinite(meta.maxCompletionTokens)
        ? Math.min(Math.max(meta.maxCompletionTokens, 1024), 1048576).toLocaleString()
        : 'provider default';
    return `Auto · following ${label}: temperature and top-p from the provider, max tokens ${maxOut}`;
};
