import { Marked } from 'marked';
import type { Tokens } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { escapeHTML } from '../escape';
import { parseCanvasBlocks, resolveCanvasType } from './canvasBlocks';
import type { CanvasBlock } from '../../types/canvas';
import { extractMath, restoreMath } from './math';

/**
 * Markdown → sanitized HTML. Ported from js/renderer.js: math is extracted
 * before parsing, canvas blocks become chips, code blocks get copy/open
 * buttons, and the result is sanitized with DOMPurify.
 */

const CANVAS_TOKEN_RE = /%%CANVAS(\d+)%%/g;

/** Set while the Canvas editor renders markdown (strips code-block buttons). */
let plainCodeMode = false;

const highlight = (code: string, language: string): string => {
  try {
    const lang = hljs.getLanguage(language) ? language : 'plaintext';
    return hljs.highlight(code, { language: lang }).value;
  } catch {
    return escapeHTML(code);
  }
};

const PREVIEWABLE = new Set(['html', 'svg', 'javascript', 'js', 'jsx', 'tsx', 'react']);

const codeRenderer = (token: Tokens.Code): string => {
  const text = token.text ?? '';
  const langStr = token.lang || 'text';
  const highlighted = highlight(text, langStr);

  if (plainCodeMode) {
    return `<pre><code class="hljs language-${escapeHTML(langStr)}">${highlighted}</code></pre>`;
  }

  const isPreviewable = PREVIEWABLE.has(langStr.toLowerCase());
  const openBtnLabel = isPreviewable ? 'Preview' : 'Open as File';
  const openBtnIcon = isPreviewable
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  return `
    <div class="code-block-wrapper">
        <div class="code-block-header">
            <span class="code-lang">${escapeHTML(langStr)}</span>
            <div class="code-block-actions">
                <button class="btn-open-artifact" data-code="${encodeURIComponent(text)}" data-lang="${escapeHTML(
                  langStr
                )}" title="${isPreviewable ? 'Run & preview in panel' : 'Open as file in panel'}">
                    ${openBtnIcon}
                    ${openBtnLabel}
                </button>
                <button class="btn-copy-code" data-code="${encodeURIComponent(text)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copy
                </button>
            </div>
        </div>
        <pre><code class="hljs language-${escapeHTML(langStr)}">${highlighted}</code></pre>
    </div>`;
};

const md = new Marked({ gfm: true, breaks: false });
md.use({ renderer: { code: codeRenderer } });

const canvasChipHTML = (block: CanvasBlock): string => {
  const attrs = block.attrs ?? {};
  const isCode = resolveCanvasType(attrs) === 'code';
  const rawTitle = (attrs.title ?? '').trim();
  const title = escapeHTML(rawTitle || (isCode ? 'Code' : 'Untitled document'));
  const lang = (attrs.lang || attrs.language || '').trim().toUpperCase();
  const meta = isCode ? `${escapeHTML(lang || 'CODE')} file · Canvas` : 'Document · Canvas';
  const payload = encodeURIComponent(JSON.stringify({ attrs, content: block.content }));
  return `<button type="button" class="canvas-chip" data-canvas="${payload}" title="Open in Canvas">
        <span class="canvas-chip__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
        <span class="canvas-chip__body">
            <span class="canvas-chip__title">${title}</span>
            <span class="canvas-chip__meta">${meta}</span>
        </span>
        <span class="canvas-chip__cta">Open</span>
    </button>`;
};

/** Render markdown without the code-block action buttons (Canvas editor). */
export const renderMarkdownPlain = (text: string): string => {
  plainCodeMode = true;
  try {
    return renderMarkdown(text);
  } finally {
    plainCodeMode = false;
  }
};

export const renderMarkdown = (text: string): string => {
  if (!text) return '';

  const canvasParts = parseCanvasBlocks(text);
  const { text: withMathTokens, stash } = extractMath(canvasParts.text);

  const parsed = md.parse(withMathTokens, { async: false });
  let html = DOMPurify.sanitize(typeof parsed === 'string' ? parsed : String(parsed), {
    ADD_TAGS: ['use', 'svg', 'button'],
    ADD_ATTR: ['href', 'data-code', 'data-msg', 'data-canvas', 'target', 'rel', 'src', 'alt'],
    FORBID_TAGS: ['style', 'script']
  });

  if (stash.length) html = restoreMath(html, stash);

  if (canvasParts.blocks.length) {
    html = html.replace(CANVAS_TOKEN_RE, (_m, i: string) =>
      canvasChipHTML(canvasParts.blocks[Number(i)] ?? { attrs: {}, content: '' })
    );
  }

  return html;
};
