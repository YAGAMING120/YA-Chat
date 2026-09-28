/**
 * The `<canvas>` protocol: the model opens/updates the Canvas side panel by
 * emitting a block like
 *
 *   <canvas title="..." type="doc|code" lang="js" action="replace|append|prepend">
 *   ...content...
 *   </canvas>
 *
 * Pure parsing helpers (ported from js/renderer.js) — no DOM, no React.
 */

import type { CanvasAttrs, CanvasBlock } from '../../types/canvas';

const CANVAS_BLOCK_RE = /<canvas\b([^>]*)>([\s\S]*?)<\/canvas\s*>/gi;
const CANVAS_ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
const CANVAS_TOKEN_RE = /%%CANVAS(\d+)%%/g;

const DOC_LANGS = new Set([
  '',
  'doc',
  'document',
  'md',
  'markdown',
  'text',
  'plaintext',
  'txt',
  'rich',
  'richtext'
]);

export const parseCanvasAttrs = (raw: string | undefined): CanvasAttrs => {
  const attrs: CanvasAttrs = {};
  CANVAS_ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CANVAS_ATTR_RE.exec(raw || '')) !== null) {
    attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
};

/** Work out whether a canvas block holds a document or a code file. */
export const resolveCanvasType = (attrs: CanvasAttrs = {}): 'doc' | 'code' => {
  const t = (attrs.type || '').toLowerCase();
  if (t === 'code' || t === 'file') return 'code';
  if (t === 'doc' || t === 'document' || t === 'text') return 'doc';
  const lang = (attrs.lang || attrs.language || '').toLowerCase();
  if (lang && !DOC_LANGS.has(lang)) return 'code';
  return 'doc';
};

/** Split canvas blocks out of a raw model reply (keeps %%CANVASn%% tokens). */
export const parseCanvasBlocks = (
  text: string | null | undefined
): { text: string; blocks: CanvasBlock[] } => {
  const blocks: CanvasBlock[] = [];
  if (!text) return { text: '', blocks };
  let out = String(text).replace(CANVAS_BLOCK_RE, (_match, attrStr: string, content: string) => {
    blocks.push({
      attrs: parseCanvasAttrs(attrStr),
      content: content.replace(/^\n+|\n+$/g, '')
    });
    return `%%CANVAS${blocks.length - 1}%%`;
  });
  out = out.replace(/<canvas\b[\s\S]*$/i, ''); // drop an unfinished tail
  return { text: out, blocks };
};

/** While streaming: hide finished blocks, fade an unfinished one out of view. */
export const stripCanvasForStream = (text: string | null | undefined): string => {
  if (!text) return '';
  const raw = String(text);
  const opens = (raw.match(/<canvas\b/gi) || []).length;
  const closes = (raw.match(/<\/canvas\s*>/gi) || []).length;
  const { text: out } = parseCanvasBlocks(raw);
  return out.replace(CANVAS_TOKEN_RE, '') + (opens > closes ? '⋯' : '');
};

/** A model reply without any canvas blocks (used for copy / TTS / export). */
export const stripCanvasBlocks = (text: string): string => parseCanvasBlocks(text).text;
