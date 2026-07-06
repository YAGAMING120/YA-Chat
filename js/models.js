/**
 * Model list fetching, filtering, searching, caching
 */
import { fetchModels as apiFetchModels } from './api.js';
import { getFromStorage, saveToStorage } from './storage.js';

const CACHE_KEY = 'opencode_zen_models_cache';
const CACHE_TIME_KEY = 'opencode_zen_models_cache_time';
const CACHE_TTL = 3600000; // 1 hour

const FREE_MODELS = ['gpt-5-nano', 'gpt-5.4-nano', 'gpt-5.1-nano'];

let modelsCache = [];
let selectedModelId = getFromStorage('opencode_zen_selected_model', 'gpt-5');

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
            renderModelsList();
            updateCurrentModelUI();
            return;
        }
    }
    
    try {
        const data = await apiFetchModels();
        modelsCache = data.map(m => ({
            id: m.id,
            name: formatModelName(m.id),
            owned_by: m.owned_by || 'opencode'
        })).sort((a, b) => a.name.localeCompare(b.name));
        saveToStorage(CACHE_KEY, modelsCache);
        saveToStorage(CACHE_TIME_KEY, now);
        renderModelsList();
        updateCurrentModelUI();
    } catch (e) {
        console.error('Failed to load models list', e);
        const container = document.getElementById('models-list-container');
        if (container && modelsCache.length === 0) {
            container.innerHTML = `<div style="padding:1rem;color:var(--bg-danger);text-align:center;">Failed to fetch models. Check your API key.</div>`;
        }
    }
};

const formatModelName = (id) => {
    return id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export const getModels = () => modelsCache;
export const getSelectedModelId = () => selectedModelId;

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
    return FREE_MODELS.includes(model.id);
};

const renderModelsList = () => {
    const container = document.getElementById('models-list-container');
    const searchInput = document.getElementById('input-search-models');
    const activeFilterBtn = document.querySelector('#modal-models .btn-filter.active');
    
    if (!container) return;
    
    const query = searchInput?.value.toLowerCase() || '';
    const filter = activeFilterBtn?.dataset.filter || 'all';
    
    let filtered = modelsCache.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
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
            <div class="model-item ${m.id === selectedModelId ? 'selected' : ''}" data-id="${m.id}">
                <div class="model-item__header">
                    <span class="model-item__title">${m.name}</span>
                    ${isFree ? `<span class="badge-free">FREE</span>` : ''}
                </div>
                <div class="model-item__desc">
                    ${m.id}
                </div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.model-item').forEach(el => {
        el.addEventListener('click', () => {
            selectedModelId = el.dataset.id;
            saveToStorage('opencode_zen_selected_model', selectedModelId);
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
        titleEl.textContent = model ? model.name : selectedModelId;
    }
};
