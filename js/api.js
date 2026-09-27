/**
 * All OpenRouter API calls (proxied through /api/proxy)
 * Docs: https://openrouter.ai/docs/api-reference/overview
 */
import { getApiKey } from './settings.js';
import { showToast } from './ui.js';

const PROXY_URL = '/api/proxy';

const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    const key = getApiKey();
    if (key) headers['Authorization'] = `Bearer ${key}`;
    return headers;
};

const readErrorMessage = async (response) => {
    try {
        const data = await response.json();
        return data?.error?.message || data?.message || '';
    } catch (e) {
        return '';
    }
};

const handleApiError = async (response, detail) => {
    if (detail === undefined) detail = await readErrorMessage(response);
    const status = response.status;

    if (status === 400) showToast(detail || 'Invalid request. Check Settings.', 'error');
    else if (status === 401) showToast('Invalid OpenRouter API key. Check Settings.', 'error');
    else if (status === 402) showToast(detail || 'Insufficient credits on OpenRouter.', 'error');
    else if (status === 403) showToast(detail || 'Request blocked by OpenRouter.', 'error');
    else if (status === 404) showToast(detail || 'Model not found on OpenRouter.', 'error');
    else if (status === 429) showToast('Rate limited or too many requests.', 'error');
    else if (status >= 500) showToast(detail || 'OpenRouter server error.', 'error');
    else showToast(detail || `API Error: ${status}`, 'error');
};

/**
 * Modalities the picker shows. OpenRouter's /models defaults to text only,
 * so we must ask for the rest explicitly (speech / embeddings / rerank / ...).
 */
export const MODEL_MODALITIES = 'text,speech,embeddings,rerank,decisions';

export const fetchModels = async (modalities = MODEL_MODALITIES) => {
    try {
        const qs = new URLSearchParams({ path: 'models', output_modalities: modalities }).toString();
        const response = await fetch(`${PROXY_URL}?${qs}`, {
            method: 'GET',
            headers: getHeaders()
        });
        if (!response.ok) {
            const detail = await readErrorMessage(response);
            handleApiError(response, detail);
            throw new Error(detail || `API returned ${response.status}`);
        }
        const data = await response.json();
        return data.data;
    } catch (e) {
        console.error('Error fetching models:', e);
        throw e;
    }
};

/**
 * Text-to-speech via POST /audio/speech — returns the raw audio as a Blob.
 * Docs: https://openrouter.ai/docs/guides/overview/multimodal/tts
 */
export const createSpeech = async ({ model, input, voice, speed, format = 'mp3' }, signal) => {
    const payload = { model, input, response_format: format };
    if (voice) payload.voice = voice;
    if (speed && speed !== 1) payload.speed = speed;

    try {
        const response = await fetch(`${PROXY_URL}?path=audio/speech`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const detail = await readErrorMessage(response);
            handleApiError(response, detail);
            throw new Error(detail || `API returned ${response.status}`);
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error('The speech service returned empty audio.');
        return blob;
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.error('Speech request error:', e);
        throw e;
    }
};

export const sendChatCompletion = async (payload, onStream, signal) => {
    try {
        const response = await fetch(`${PROXY_URL}?path=chat/completions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
            signal
        });
        if (!response.ok) {
            const detail = await readErrorMessage(response);
            handleApiError(response, detail);
            throw new Error(detail || `API returned ${response.status}`);
        }

        if (payload.stream) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let completeResponse = '';
            let streamError = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep the last incomplete line in the buffer

                for (let line of lines) {
                    line = line.trim();
                    // SSE keep-alive comments look like ": OPENROUTER PROCESSING"
                    if (!line || line.startsWith(':')) continue;
                    if (!line.startsWith('data: ')) continue;

                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') continue;

                    let data;
                    try {
                        data = JSON.parse(dataStr);
                    } catch (err) {
                        console.warn('Failed to parse SSE JSON:', dataStr);
                        continue;
                    }

                    // Mid-stream errors arrive as a top-level `error` field
                    if (data.error) {
                        streamError = data.error.message || 'OpenRouter stream error';
                        break;
                    }

                    const delta = data.choices?.[0]?.delta || {};
                    const reasoning = extractReasoning(delta);
                    const content = delta.content || '';

                    if (reasoning && onStream) {
                        onStream(completeResponse, null, reasoning, 'reasoning');
                    }
                    if (content) {
                        completeResponse += content;
                        if (onStream) onStream(completeResponse, data.usage || null, null, 'content');
                    } else if (data.usage && onStream) {
                        onStream(completeResponse, data.usage, null, 'content');
                    }
                }
                if (streamError) break;
            }

            if (streamError) throw new Error(streamError);
            return completeResponse;
        } else {
            const data = await response.json();
            return data;
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Stream aborted');
            throw e;
        }
        console.error('Chat completion error:', e);
        throw e;
    }
};

/** OpenRouter normalizes reasoning into several shapes depending on provider */
const extractReasoning = (delta) => {
    if (typeof delta.reasoning === 'string' && delta.reasoning) return delta.reasoning;
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) return delta.reasoning_content;
    if (Array.isArray(delta.reasoning_details)) {
        return delta.reasoning_details
            .map(d => d.summary || d.text || '')
            .join('');
    }
    return '';
};
