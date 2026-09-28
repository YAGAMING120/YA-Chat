import type { StreamEvent, StreamListener } from '../../types/stream';
import { apiErrorFromResponse, ApiError, isAbortError } from './errors';
import { getHeaders, proxyUrl, readErrorMessage } from './client';
import type { ChatCompletionPayload, StreamChunk } from './types';
import { extractReasoning } from './streaming';

/**
 * POST /chat/completions with `stream: true` and pump the SSE response
 * through `onEvent` until the stream ends, errors, or is aborted.
 *
 * Returns the complete assistant text.
 */
export const streamChatCompletion = async (
  payload: ChatCompletionPayload,
  onEvent: StreamListener,
  signal: AbortSignal,
  apiKey?: string
): Promise<string> => {
  let response: Response;
  try {
    response = await fetch(proxyUrl('chat/completions'), {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(payload),
      signal
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError('Network request failed', 'Network error — check your connection.');
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw apiErrorFromResponse(response.status, detail);
  }

  if (!response.body) {
    throw new ApiError('Empty response body', 'OpenRouter returned an empty response.');
  }

  const emit = (event: StreamEvent) => onEvent(event);

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let completeResponse = '';
  let streamError = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the last incomplete line

      for (let line of lines) {
        line = line.trim();
        // SSE keep-alive comments look like ": OPENROUTER PROCESSING"
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        let data: StreamChunk;
        try {
          data = JSON.parse(dataStr) as StreamChunk;
        } catch {
          console.warn('Failed to parse SSE JSON:', dataStr);
          continue;
        }

        // Mid-stream errors arrive as a top-level `error` field
        if (data.error) {
          streamError = data.error.message || 'OpenRouter stream error';
          break;
        }

        const choice = data.choices?.[0] ?? {};
        const delta = choice.delta ?? {};
        const usage = data.usage ?? null;

        const reasoning = extractReasoning(delta);
        if (reasoning) emit({ type: 'reasoning', chunk: reasoning });

        // Server-tool activity — the model calling web_search / web_fetch / image_generation
        const toolCalls = delta.tool_calls ?? choice.message?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length) {
          const names = toolCalls
            .map((tc) => tc.function?.name || tc.type || '')
            .filter(Boolean);
          if (names.length) emit({ type: 'tool', names, usage });
        }

        // Citations — url_citation annotations land near the end of the stream
        const annotations =
          delta.annotations ?? choice.message?.annotations ?? data.annotations;
        if (Array.isArray(annotations) && annotations.length) {
          emit({ type: 'annotations', annotations, usage });
        }

        const content = delta.content || '';
        if (content) {
          completeResponse += content;
          emit({ type: 'content', fullText: completeResponse, usage });
        } else if (data.usage) {
          emit({ type: 'usage', usage: data.usage });
        }
      }
      if (streamError) break;
    }
  } finally {
    reader.releaseLock?.();
  }

  if (streamError) throw new ApiError(streamError, streamError);
  return completeResponse;
};
