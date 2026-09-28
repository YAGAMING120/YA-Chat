import { apiErrorFromResponse, ApiError, isAbortError } from './errors';
import { getHeaders, proxyUrl, readErrorMessage } from './client';

export interface SpeechRequest {
  model: string;
  input: string;
  voice?: string;
  speed?: number;
  /** mp3 (default) or pcm */
  format?: string;
}

/**
 * POST /audio/speech — returns the raw audio as a Blob.
 * Docs: https://openrouter.ai/docs/guides/overview/multimodal/tts
 */
export const createSpeech = async (
  request: SpeechRequest,
  signal: AbortSignal,
  apiKey?: string
): Promise<Blob> => {
  const { model, input, voice, speed, format = 'mp3' } = request;
  const payload: Record<string, unknown> = {
    model,
    input,
    response_format: format
  };
  if (voice) payload.voice = voice;
  if (speed && speed !== 1) payload.speed = speed;

  let response: Response;
  try {
    response = await fetch(proxyUrl('audio/speech'), {
      method: 'POST',
      headers: getHeaders(apiKey),
      body: JSON.stringify(payload),
      signal
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError('Speech request failed', 'Speech request failed — check your connection.');
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw apiErrorFromResponse(response.status, detail);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new ApiError('Empty audio', 'The speech service returned empty audio.');
  }
  return blob;
};
