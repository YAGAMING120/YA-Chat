/**
 * Text-to-Speech modal
 *
 * Uses OpenRouter's OpenAI-compatible POST /audio/speech endpoint, which
 * returns a raw audio byte stream (mp3 by default). Free speech models:
 *   deepgram/flux-tts:free, fish-audio/s2.1-pro-free:free
 */
import { createSpeech } from './api.js';
import { getSpeechModels, getModelEntry } from './models.js';
import { subscribe as subscribeCatalog } from './capabilities.js';
import { showToast } from './ui.js';

const MAX_CHARS = 4000;

let initialized = false;
let currentObjectUrl = null;
let currentAbort = null;

const el = (id) => document.getElementById(id);

export const initTTS = () => {
    if (initialized) return;
    initialized = true;

    el('btn-tts')?.addEventListener('click', () => openTTS(el('chat-input')?.value || ''));

    el('btn-close-tts')?.addEventListener('click', closeTTS);
    el('modal-tts')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeTTS();
    });

    el('tts-model')?.addEventListener('change', renderVoices);
    el('tts-generate')?.addEventListener('click', generate);

    const textEl = el('tts-text');
    textEl?.addEventListener('input', updateCount);

    // Sent from the model picker when the user clicks a speech model
    document.addEventListener('tts-open', (e) => {
        openTTS(el('chat-input')?.value || '', e.detail?.modelId);
    });

    populateModels();

    // Models load asynchronously — repopulate the dropdown when the catalog lands
    subscribeCatalog(() => {
        const select = el('tts-model');
        const current = select?.value || '';
        populateModels(current || undefined);
    });
};

const populateModels = (preferredId) => {
    const select = el('tts-model');
    if (!select) return;
    const models = getSpeechModels();
    if (models.length === 0) {
        select.innerHTML = '<option value="">No speech models loaded yet</option>';
        return;
    }
    select.innerHTML = models.map(m =>
        `<option value="${m.id.replace(/"/g, '&quot;')}" ${m.free ? 'data-free="1"' : ''}>${m.name}${m.free ? ' — FREE' : ''}</option>`
    ).join('');
    if (preferredId && models.some(m => m.id === preferredId)) select.value = preferredId;
    else if (models[0]) select.value = models[0].id;
    renderVoices();
};

const renderVoices = () => {
    const select = el('tts-voice');
    if (!select) return;
    const id = el('tts-model')?.value;
    const entry = id ? getModelEntry(id) : null;
    const voices = entry?.voices || [];

    if (voices.length === 0) {
        // Model has no published voice list (e.g. Fish Audio) → provider default
        select.innerHTML = '<option value="">Provider default voice</option>';
        return;
    }
    select.innerHTML = voices.map(v =>
        `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`
    ).join('');
};

const updateCount = () => {
    const textEl = el('tts-text');
    const countEl = el('tts-count');
    if (!textEl || !countEl) return;
    const len = textEl.value.length;
    countEl.textContent = `${len.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
    countEl.classList.toggle('tts-count--over', len > MAX_CHARS);
};

/** Strip markdown/HTML noise so the voice doesn't read syntax aloud */
export const toSpeechText = (raw) => String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // links → text
    .replace(/<[^>]+>/g, ' ')                  // html tags
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // headings
    .replace(/^\s{0,3}>\s?/gm, '')             // quotes
    .replace(/^\s*[-*+]\s+/gm, '')             // bullets
    .replace(/^\s*\d+\.\s+/gm, '')             // ordered lists
    .replace(/\*\*([^*]+)\*\*/g, '$1')         // bold
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')             // italic
    .replace(/~~([^~]+)~~/g, '$1')             // strikethrough
    .replace(/^\s{0,3}[-=_*]{3,}\s*$/gm, ' ')  // hr
    .replace(/\s+/g, ' ')
    .trim();

export const openTTS = (text = '', modelId = null) => {
    const modal = el('modal-tts');
    if (!modal) return;
    populateModels(modelId || undefined);

    const textEl = el('tts-text');
    if (textEl) textEl.value = toSpeechText(text).substring(0, MAX_CHARS);
    updateCount();

    modal.style.display = 'flex';
    if (!textEl?.value) setTimeout(() => textEl?.focus(), 50);
};

const closeTTS = () => {
    const modal = el('modal-tts');
    if (modal) modal.style.display = 'none';
    if (currentAbort) { currentAbort.abort(); currentAbort = null; }
};

const setState = (state) => {
    const btn = el('tts-generate');
    const status = el('tts-status');
    const player = el('tts-audio');
    if (btn) {
        btn.disabled = state === 'loading';
        btn.querySelector('.tts-generate__label').textContent = state === 'loading' ? 'Generating…' : 'Generate speech';
    }
    if (status) {
        status.style.display = state === 'idle' ? 'none' : 'block';
        status.classList.remove('tts-status--error', 'tts-status--ok');
        if (state === 'loading') status.textContent = 'Synthesizing audio…';
        else if (state === 'error') status.classList.add('tts-status--error');
        else if (state === 'done') {
            status.textContent = 'Ready — play it below or download the file.';
            status.classList.add('tts-status--ok');
        }
    }
    if (player) player.style.display = state === 'done' ? 'block' : 'none';
    const dl = el('tts-download');
    if (dl) dl.style.display = state === 'done' ? 'inline-flex' : 'none';
};

const generate = async () => {
    const textEl = el('tts-text');
    const input = toSpeechText(textEl?.value);
    if (!input) {
        showToast('Type some text to convert to speech.', 'error');
        textEl?.focus();
        return;
    }
    if (input.length > MAX_CHARS) {
        showToast(`Text is too long — keep it under ${MAX_CHARS.toLocaleString()} characters.`, 'error');
        return;
    }
    const model = el('tts-model')?.value;
    if (!model) {
        showToast('No speech model available. Check your models list.', 'error');
        return;
    }

    const voice = el('tts-voice')?.value || '';
    const speed = parseFloat(el('tts-speed')?.value || '1') || 1;
    const format = el('tts-format')?.value === 'pcm' ? 'pcm' : 'mp3';

    setState('loading');
    if (currentAbort) currentAbort.abort();
    currentAbort = new AbortController();

    try {
        const blob = await createSpeech({ model, input, voice, speed, format }, currentAbort.signal);
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        const mime = format === 'pcm' ? 'audio/wav' : 'audio/mpeg';
        currentObjectUrl = URL.createObjectURL(new Blob([blob], { type: mime }));

        const player = el('tts-audio');
        if (player) player.src = currentObjectUrl;

        const dl = el('tts-download');
        if (dl) dl.href = currentObjectUrl;

        setState('done');
        showToast('Speech generated — press play or download it.', 'success');
        const audio = el('tts-audio');
        try {
            const playing = audio?.play();
            if (playing && typeof playing.catch === 'function') playing.catch(() => { /* autoplay may be blocked */ });
        } catch (e) { /* player not available */ }
    } catch (e) {
        if (e.name === 'AbortError') { setState('idle'); return; }
        const status = el('tts-status');
        if (status) {
            status.textContent = e.message || 'Speech generation failed.';
            status.style.display = 'block';
        }
        setState('error');
        showToast(e.message || 'Speech generation failed.', 'error');
    } finally {
        currentAbort = null;
    }
};
