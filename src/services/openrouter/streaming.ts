import type { StreamDelta } from './types';

/**
 * OpenRouter normalizes reasoning into several shapes depending on provider.
 * Ported verbatim from js/api.js.
 */
export const extractReasoning = (delta: StreamDelta): string => {
  if (typeof delta.reasoning === 'string' && delta.reasoning) return delta.reasoning;
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
    return delta.reasoning_content;
  }
  if (Array.isArray(delta.reasoning_details)) {
    return delta.reasoning_details.map((d) => d.summary || d.text || '').join('');
  }
  return '';
};
