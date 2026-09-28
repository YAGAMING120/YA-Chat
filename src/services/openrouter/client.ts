/**
 * Low-level OpenRouter proxy client (no UI, no React).
 * Every call goes through the Vercel serverless proxy at /api/proxy.
 * Docs: https://openrouter.ai/docs/api-reference/overview
 */

export const PROXY_URL = '/api/proxy';

/**
 * Modalities the picker shows. OpenRouter's /models defaults to text only,
 * so we must ask for the rest explicitly (speech / embeddings / image / ...).
 */
export const MODEL_MODALITIES = 'text,speech,embeddings,rerank,decisions,image';

/** Build `/api/proxy?path=…&…` preserving extra query params. */
export const proxyUrl = (path: string, params?: Record<string, string>): string => {
  const search = new URLSearchParams({ path });
  if (params) Object.entries(params).forEach(([k, v]) => search.set(k, v));
  return `${PROXY_URL}?${search.toString()}`;
};

/**
 * BYOK: the key comes from user settings and is attached per request.
 * It is forwarded to OpenRouter by the proxy — never embedded in the bundle.
 */
export const getHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
};

export const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return data?.error?.message || data?.message || '';
  } catch {
    return '';
  }
};
