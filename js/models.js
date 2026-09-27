/**
 * Model list fetching, filtering, searching, caching
 *
 * OpenRouter's /models defaults to output_modalities=text, so we explicitly ask
 * for speech / embeddings / rerank / decisions too — otherwise the free voice
 * models never appear in the picker.
 */
import { fetchModels as apiFetchModels } from './api.js';
import { getFromStorage, saveToStorage } from './storage.js';
import { setCatalog, setSelected, getMeta, canChat } from './capabilities.js';
import { showToast } from './ui.js';

const CACHE_KEY = 'or_models_cache_v2';
const CACHE_TIME_KEY = 'or_models_cache_time';
const SELECTED_KEY = 'or_selected_model';

const CACHE_TTL = 3600000; // 1 hour

// OpenRouter's free-model router: always free, routes to an available free model
const DEFAULT_MODEL = 'openrouter/free';

let modelsCache = [];
let selectedModelId = getFromStorage(SELECTED_KEY, null);

export const initModels = async () => {
    console.log('Models initialized');
    setupModelsUI();
    await loadModels();
};

/** Flatten OpenRouter's modality string/arrays into comparable lists */
const toModalityList = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value) return value.split('+');
    return [];
};

const loadModels = async () => {
    const cachedTime = getFromStorage(CACHE_TIME_KEY, 0);
    const now = Date.now();

    if (now - cachedTime < CACHE_TTL) {
        const cachedModels = getFromStorage(CACHE_KEY, []);
        if (cachedModels && cachedModels.length > 0) {
            modelsCache = cachedModels;
            ensureValidSelection();
            renderModelsList();
            updateCurrentModelUI();
            return;
        }
    }

    try {
        const data = await apiFetchModels();
        modelsCache = (data || [])
            .filter(m => m && m.id)
            .map(toModelEntry)
            .sort((a, b) => (b.free - a.free) || a.name.localeCompare(b.name));
        saveToStorage(CACHE_KEY, modelsCache);
        saveToStorage(CACHE_TIME_KEY, now);
        ensureValidSelection();
        renderModelsList();
        updateCurrentModelUI();
    } catch (e) {
        console.error('Failed to load models list', e);
        const container = document.getElementById('models-list-container');
        if (container && modelsCache.length === 0) {
            container.innerHTML = `<div style="padding:1rem;color:var(--bg-danger);text-align:center;">Failed to fetch models. Check your OpenRouter API key.</div>`;
        }
    }
};

/** Slim + enrich a raw /models entry so badges/filters work offline from cache */
const toModelEntry = (m) => {
    const arch = m.architecture || {};
    const modality = arch.modality || '';
    // "text+image->text" → input / output halves
    const [inPart = '', outPart = ''] = modality.split('->');
    const input = arch.input_modalities && arch.input_modalities.length
        ? arch.input_modalities
        : toModalityList(inPart);
    const output = arch.output_modalities && arch.output_modalities.length
        ? arch.output_modalities
        : toModalityList(outPart);
    const meta = {
        in: input,
        out: output,
        params: m.supported_parameters || [],
        ctx: m.context_length ?? null,
        maxOut: m.top_provider?.max_completion_tokens ?? null
    };
    return {
        id: m.id,
        name: m.name || formatModelName(m.id),
        owned_by: m.id.includes('/') ? m.id.split('/')[0] : (m.owned_by || 'openrouter'),
        free: isFreeModel(m),
        description: m.description || '',
        input,
        output,
        voices: Array.isArray(m.supported_voices) ? m.supported_voices : [],
        caps: meta
    };
};

/** OpenRouter free tiers carry the `:free` variant suffix or literally zero pricing */
const isFreeModel = (m) => {
    if (m.id && m.id.endsWith(':free')) return true;
    const p = m.pricing;
    if (!p) return false;
    const prompt = parseFloat(p.prompt);
    const completion = parseFloat(p.completion);
    if (Number.isNaN(prompt) || Number.isNaN(completion)) return false;
    return prompt === 0 && completion === 0;
};

const formatModelName = (id) => {
    const slug = id.includes('/') ? id.split('/').pop() : id;
    return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

/** Fall back to a free chat model if the stored pick no longer exists / can't chat */
const ensureValidSelection = () => {
    if (modelsCache.length === 0) return;
    setCatalog(modelsCache);
    const usable = (id) => canChat(getMeta(id));
    if (selectedModelId && usable(selectedModelId)) {
        setSelected(selectedModelId);
        return;
    }
    const preferred = modelsCache.find(m => m.id === DEFAULT_MODEL && usable(m.id))
        || modelsCache.find(m => usable(m.id))
        || modelsCache.find(m => m.id === DEFAULT_MODEL)
        || modelsCache[0];
    selectedModelId = preferred.id;
    saveToStorage(SELECTED_KEY, selectedModelId);
    setSelected(selectedModelId);
};

export const getModels = () => modelsCache;
export const getSelectedModelId = () => selectedModelId || DEFAULT_MODEL;
export const getModelEntry = (id) => modelsCache.find(m => m.id === id) || null;

/** Free (and paid) speech models, free first — used by the TTS modal */
export const getSpeechModels = () => modelsCache
    .filter(m => m.output.includes('speech') || m.output.includes('audio'))
    .sort((a, b) => (b.free - a.free) || a.name.localeCompare(b.name));

const setupModelsUI = () => {
    const btnModelSelector = document.getElementById('btn-model-selector');
    const modalModels = document.getElementById('modal-models');
    const btnCloseModels = document.getElementById('btn-close-models');
    const searchInput = document.getElementById('input-search-models');
    const filterBtns = document.querySelectorAll('#modal-models .btn-filter');

    btnModelSelector?.addEventListener('click', () => {
        if (modalModels) modalModels.style.display = 'flex';
        setTimeout(() => searchInput?.focus(), 50);
    });

    btnCloseModels?.addEventListener('click', () => {
        if (modalModels) modalModels.style.display = 'none';
        searchInput.value = '';
        renderModelsList();
    });

    searchInput?.addEventListener('input', () => renderModelsList());

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderModelsList();
        });
    });
};

const badgeFor = (m) => {
    const badges = [];
    if (m.free) badges.push('<span class="badge-free">FREE</span>');
    if (m.output.includes('speech')) badges.push('<span class="badge-type badge-type--voice">TTS</span>');
    if (m.output.includes('embeddings')) badges.push('<span class="badge-type badge-type--embed">EMBED</span>');
    if (m.output.includes('rerank')) badges.push('<span class="badge-type badge-type--rerank">RERANK</span>');
    if (m.output.includes('decisions')) badges.push('<span class="badge-type badge-type--decision">DECISION</span>');
    if (m.output.includes('image')) badges.push('<span class="badge-type badge-type--image">IMAGE</span>');
    if (m.input.includes('image') || m.input.includes('audio') || m.input.includes('video')) {
        badges.push('<span class="badge-type badge-type--vision">MULTIMODAL</span>');
    }
    return badges.join(' ');
};

/** What a click on a row means for each kind of model */
const canSelect = (m) => canChat(getMeta(m.id));

const matchesFilter = (m, filter) => {
    if (filter === 'free') return m.free;
    if (filter === 'chat') return canSelect(m);
    if (filter === 'voice') return m.output.includes('speech') || m.output.includes('audio');
    return true;
};

const renderModelsList = () => {
    const container = document.getElementById('models-list-container');
    const searchInput = document.getElementById('input-search-models');
    const activeFilterBtn = document.querySelector('#modal-models .btn-filter.active');

    if (!container) return;

    const query = searchInput?.value.toLowerCase() || '';
    const filter = activeFilterBtn?.dataset.filter || 'all';

    const filtered = modelsCache.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(query)
            || m.id.toLowerCase().includes(query)
            || (m.owned_by || '').toLowerCase().includes(query)
            || (m.description || '').toLowerCase().includes(query);
        return matchesSearch && matchesFilter(m, filter);
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:2rem;color:var(--text-dim);text-align:center;">No models found matching criteria.</div>';
        return;
    }

    container.innerHTML = filtered.map(m => {
        const selectable = canSelect(m);
        const isSpeech = m.output.includes('speech') || m.output.includes('audio');
        const kind = isSpeech ? 'speech' : (selectable ? 'chat' : 'unsupported');
        const blocked = !selectable && !isSpeech;
        return `
            <div class="model-item ${m.id === selectedModelId ? 'selected' : ''} ${blocked ? 'model-item--blocked' : ''}"
                 data-id="${escapeAttr(m.id)}" data-kind="${kind}"
                 ${blocked ? 'title="This model cannot reply in chat — embeddings, rerank and decisions models are not chat models."' : ''}>
                <div class="model-item__header">
                    <span class="model-item__title">${escapeHTML(m.name)}</span>
                    <span class="model-item__badges">${badgeFor(m)}</span>
                </div>
                <div class="model-item__desc">
                    ${escapeHTML(m.id)}
                </div>
                ${m.description ? `<div class="model-item__summary">${escapeHTML(m.description)}</div>` : ''}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.model-item').forEach(el => {
        el.addEventListener('click', () => handleModelClick(el.dataset.id));
    });
};

const handleModelClick = (id) => {
    const entry = getModelEntry(id);
    if (!entry) return;

    if (canSelect(entry)) {
        selectedModelId = id;
        saveToStorage(SELECTED_KEY, selectedModelId);
        setSelected(selectedModelId);
        document.getElementById('modal-models').style.display = 'none';
        renderModelsList();
        updateCurrentModelUI();
        return;
    }

    // Speech models drive the TTS modal, everything else is not selectable
    if (entry.output.includes('speech') || entry.output.includes('audio')) {
        document.getElementById('modal-models').style.display = 'none';
        document.dispatchEvent(new CustomEvent('tts-open', { detail: { modelId: id } }));
        return;
    }

    showToast(`${entry.name} can't reply in chat — it's a ${entry.output.join('/')} model, not a text model.`, 'error');
};

const updateCurrentModelUI = () => {
    const titleEl = document.getElementById('current-model-name');
    if (titleEl) {
        const model = modelsCache.find(m => m.id === selectedModelId);
        titleEl.textContent = model ? model.name : (selectedModelId || 'Select model');
    }
};

const escapeHTML = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeAttr = escapeHTML;
