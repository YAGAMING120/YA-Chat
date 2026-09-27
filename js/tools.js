/**
 * Server tools — OpenRouter executes them server-side during a single request,
 * so the browser never runs an agent loop of its own.
 * Docs: https://openrouter.ai/docs/guides/features/server-tools
 */
import { getImageModels } from './models.js';
import { getFromStorage, saveToStorage } from './storage.js';

const STORAGE_KEY = 'or_tools_v1';

const DEFAULT_IMAGE_MODEL = 'openai/gpt-5-image';

const svg = (paths) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const ICONS = {
    search: svg('<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>'),
    clock: svg('<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>')
};

/** Which tools exist, how they're wired into the request, and how they're labelled */
export const TOOL_DEFS = [
    {
        id: 'web_search',
        type: 'openrouter:web_search',
        label: 'Web search',
        desc: 'Grounds the answer in live results and cites them',
        note: 'Billed per search',
        chip: 'Searching the web…',
        icon: ICONS.search,
        build: () => ({
            type: 'openrouter:web_search',
            parameters: { max_results: 5, max_uses: 3 }
        })
    },
    {
        id: 'datetime',
        type: 'openrouter:datetime',
        label: 'Date & time',
        desc: 'Keeps the model aware of today’s date and time',
        note: 'Free',
        chip: 'Checking the date…',
        icon: ICONS.clock,
        build: () => ({ type: 'openrouter:datetime' })
    },
    {
        id: 'web_fetch',
        type: 'openrouter:web_fetch',
        label: 'Read a URL',
        desc: 'Opens links and PDFs you paste, then answers about them',
        note: 'Free',
        chip: 'Reading page…',
        icon: ICONS.link,
        build: () => ({
            type: 'openrouter:web_fetch',
            parameters: { engine: 'openrouter', max_uses: 5 }
        })
    },
    {
        id: 'image_generation',
        type: 'openrouter:image_generation',
        label: 'Image generation',
        desc: 'Draws images straight into the conversation',
        note: 'Per-image cost',
        chip: 'Generating image…',
        icon: ICONS.image,
        build: () => ({ type: 'openrouter:image_generation', parameters: buildImageParams() })
    }
];

const buildImageParams = () => {
    const params = {};
    if (state.imageModel) params.model = state.imageModel;
    return params;
};

const stored = getFromStorage(STORAGE_KEY, null) || {};
let state = {
    // Off by default: a request only ever gains a `tools` array once the user opts in
    enabled: Object.assign({}, stored.enabled || {}),
    imageModel: stored.imageModel || ''
};

const persist = () => saveToStorage(STORAGE_KEY, state);

export const isToolEnabled = (id) => !!state.enabled[id];
export const getEnabledToolIds = () => TOOL_DEFS.filter(t => state.enabled[t.id]).map(t => t.id);

/** `tools` + budget to add to a chat payload — {} when nothing is switched on */
export const buildToolsPayload = () => {
    const tools = TOOL_DEFS.filter(t => state.enabled[t.id]).map(t => t.build());
    if (!tools.length) return {};
    return { tools, max_tool_calls: 8 };
};

/** Live status line shown while a server tool is running mid-stream */
export const getToolChipLabel = (name) => {
    if (!name) return null;
    const key = String(name).replace(/^openrouter:/, '');
    const def = TOOL_DEFS.find(t => t.id === key || t.type === name);
    return def ? def.chip : null;
};

let popover = null;

const renderPopover = () => `
    <div class="tools-popover__head">
        <span>Tools</span>
        <span class="tools-popover__hint">run server-side on each message</span>
    </div>
    <div class="tools-popover__list">
        ${TOOL_DEFS.map(def => `
            <label class="tool-row" data-tool="${def.id}">
                <input type="checkbox" class="tool-row__check" ${state.enabled[def.id] ? 'checked' : ''}>
                <span class="tool-row__icon">${def.icon}</span>
                <span class="tool-row__text">
                    <span class="tool-row__title">
                        ${def.label}
                        <em class="tool-row__note">${def.note}</em>
                    </span>
                    <span class="tool-row__desc">${def.desc}</span>
                </span>
            </label>
        `).join('')}
    </div>
    <div class="tool-row tool-row--sub" id="tool-image-row" style="display:${state.enabled.image_generation ? '' : 'none'}">
        <span class="tool-row__icon"></span>
        <span class="tool-row__text">
            <span class="tool-row__title">Image model</span>
            <select class="tool-row__select" id="tool-image-model"></select>
        </span>
    </div>
`;

const populateImageModels = () => {
    const select = document.getElementById('tool-image-model');
    if (!select) return;
    const list = getImageModels();
    const current = state.imageModel;
    select.innerHTML = `<option value="">Auto (openai/gpt-5-image)</option>` +
        list.map(m => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${m.free ? 'FREE · ' : ''}${m.name}</option>`).join('');
    if (current && !list.some(m => m.id === current)) {
        select.insertAdjacentHTML('afterbegin', `<option value="${current}" selected>${current}</option>`);
    }
};

const syncButton = () => {
    const btn = document.getElementById('btn-tools');
    if (!btn) return;
    const count = getEnabledToolIds().length;
    btn.classList.toggle('btn-tool--active', count > 0);
    btn.classList.toggle('btn-tool--has-tools', count > 0);
    const countEl = btn.querySelector('.btn-tool__count');
    if (countEl) {
        countEl.textContent = count ? String(count) : '';
        countEl.style.display = count ? '' : 'none';
    }
    btn.title = count
        ? `Tools: ${getEnabledToolIds().map(id => TOOL_DEFS.find(t => t.id === id).label).join(', ')}`
        : 'Tools — web search, date & time, read URL, images';
};

const closePopover = () => {
    if (popover) popover.hidden = true;
};

export const initTools = () => {
    const btn = document.getElementById('btn-tools');
    const wrapper = document.querySelector('.input-wrapper');
    if (!btn || !wrapper || popover) return;

    popover = document.createElement('div');
    popover.className = 'tools-popover';
    popover.id = 'tools-popover';
    popover.hidden = true;
    popover.innerHTML = renderPopover();
    wrapper.appendChild(popover);

    popover.addEventListener('click', (e) => e.stopPropagation());

    popover.querySelectorAll('.tool-row__check').forEach(check => {
        check.addEventListener('change', () => {
            const id = check.closest('.tool-row').dataset.tool;
            state.enabled[id] = check.checked;
            persist();
            if (id === 'image_generation') {
                const sub = popover.querySelector('#tool-image-row');
                if (sub) sub.style.display = check.checked ? '' : 'none';
                if (check.checked) populateImageModels();
            }
            syncButton();
        });
    });

    popover.addEventListener('change', (e) => {
        if (e.target.id === 'tool-image-model') {
            state.imageModel = e.target.value;
            persist();
        }
    });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = popover.hidden;
        if (willOpen) {
            populateImageModels();
            // The model catalog may still be loading — refill once it lands
            if (!getImageModels().length) setTimeout(populateImageModels, 1500);
        }
        popover.hidden = !willOpen;
    });

    document.addEventListener('click', closePopover);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });

    syncButton();
};
