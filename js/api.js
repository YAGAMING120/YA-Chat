/**
 * All OpenCode Zen API calls
 */
import { getApiKey } from './settings.js';
import { showToast } from './ui.js';

const PROXY_URL = '/api/proxy';

const getHeaders = () => ({
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json'
});

const handleApiError = (status) => {
    if (status === 401) showToast('Invalid API Key setup. Check Settings.', 'error');
    else if (status === 402) showToast('Insufficient credits on OpenCode Zen.', 'error');
    else if (status === 429) showToast('Rate limited or too many requests.', 'error');
    else if (status >= 500) showToast('OpenCode Zen server error.', 'error');
    else showToast(`API Error: ${status}`, 'error');
};

export const fetchModels = async () => {
    try {
        const response = await fetch(`${PROXY_URL}?path=models`, {
            method: 'GET',
            headers: getHeaders()
        });
        if (!response.ok) {
            handleApiError(response.status);
            throw new Error(`API returned ${response.status}`);
        }
        const data = await response.json();
        return data.data;
    } catch (e) {
        console.error('Error fetching models:', e);
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
            handleApiError(response.status);
            throw new Error(`API returned ${response.status}`);
        }
        
        if (payload.stream) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let completeResponse = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep the last incomplete line in the buffer
                
                for (let line of lines) {
                    line = line.trim();
                    if (!line || !line.startsWith('data: ')) continue;
                    
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') continue;
                    
                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices[0]?.delta || {};
                        const reasoning = delta.reasoning || delta.thinking || '';
                        const content = delta.content || '';

                        if (reasoning && onStream) {
                            onStream(completeResponse, null, reasoning, 'reasoning');
                        }
                        if (content) {
                            completeResponse += content;
                            if (onStream) onStream(completeResponse, data.usage || null, null, 'content');
                        }
                    } catch (err) {
                        console.warn("Failed to parse SSE JSON:", dataStr);
                    }
                }
            }
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
