/**
 * Model list fetching, filtering, searching, caching
 */
import { fetchModels as apiFetchModels } from './api.js';
import { getFromStorage, saveToStorage } from './storage.js';

const CACHE_KEY = 'or_models_cache';
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
        modelsCache = data
            .filter(m => m && m.id)
            .map(m => ({
                id: m.id,
                name: m.name || formatModelName(m.id),
                owned_by: m.id.includes('/') ? m.id.split('/')[0] : (m.owned_by || 'openrouter'),
                free: isFreeModel(m)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
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

/** Fall back to a free model if the stored pick no longer exists */
const ensureValidSelection = () => {
    if (modelsCache.length === 0) return;
    if (selectedModelId && modelsCache.some(m => m.id === selectedModelId)) return;
    const preferred = modelsCache.find(m => m.id === DEFAULT_MODEL)
        || modelsCache.find(m => m.free)
        || modelsCache[0];
    selectedModelId = preferred.id;
    saveToStorage(SELECTED_KEY, selectedModelId);
};

export const getModels = () => modelsCache;
export const getSelectedModelId = () => selectedModelId || DEFAULT_MODEL;

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

const isModelFree = (model) => {
    if (typeof model.free === 'boolean') return model.free;
    return model.id.endsWith(':free');
};

const renderModelsList = () => {
    const container = document.getElementById('models-list-container');
    const searchInput = document.getElementById('input-search-models');
    const activeFilterBtn = document.querySelector('#modal-models .btn-filter.active');

    if (!container) return;

    const query = searchInput?.value.toLowerCase() || '';
    const filter = activeFilterBtn?.dataset.filter || 'all';

    let filtered = modelsCache.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(query)
            || m.id.toLowerCase().includes(query)
            || (m.owned_by || '').toLowerCase().includes(query);
        const matchesFilter = filter === 'all' || (filter === 'free' && isModelFree(m));
        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:2rem;color:var(--text-dim);text-align:center;">No models found matching criteria.</div>';
        return;
    }

    container.innerHTML = filtered.map(m => {
        const isFree = isModelFree(m);
        return `
            <div class="model-item ${m.id === selectedModelId ? 'selected' : ''}" data-id="${escapeAttr(m.id)}">
                <div class="model-item__header">
                    <span class="model-item__title">${escapeHTML(m.name)}</span>
                    ${isFree ? `<span class="badge-free">FREE</span>` : ''}
                </div>
                <div class="model-item__desc">
                    ${escapeHTML(m.id)}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.model-item').forEach(el => {
        el.addEventListener('click', () => {
            selectedModelId = el.dataset.id;
            saveToStorage(SELECTED_KEY, selectedModelId);
            document.getElementById('modal-models').style.display = 'none';
            renderModelsList();
            updateCurrentModelUI();
        });
    });
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
