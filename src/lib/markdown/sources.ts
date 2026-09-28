import type { Source } from '../../types/chat';

/**
 * Normalizes OpenRouter `url_citation` annotations into `{url, title, host}`,
 * deduped and restricted to http(s) so a model can't emit a javascript: link.
 * Ported from js/renderer.js.
 */
export const normalizeSources = (annotations: unknown): Source[] => {
  if (!Array.isArray(annotations)) return [];
  const seen = new Set<string>();
  const out: Source[] = [];

  annotations.forEach((raw) => {
    const a = raw as { url_citation?: { url?: unknown; title?: unknown }; url?: unknown; title?: unknown } | null;
    const c = (a && a.url_citation) || a || {};
    const url = c.url;
    if (typeof url !== 'string') return;

    let host = '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      host = parsed.hostname.replace(/^www\./, '');
    } catch {
      return;
    }

    if (seen.has(url)) return;
    seen.add(url);

    const title = typeof c.title === 'string' && c.title ? c.title : host || url;
    out.push({ url, title, host });
  });

  return out;
};
