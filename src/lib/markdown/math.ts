/**
 * Math (LaTeX) support for the markdown pipeline.
 *
 * Math is extracted BEFORE markdown parsing (so marked/DOMPurify never mangle
 * it) and re-injected as rendered KaTeX HTML AFTER sanitizing.
 * Ported from js/renderer.js.
 */

import katex from 'katex';
import { escapeHTML } from '../escape';

export interface MathSegment {
  expr: string;
  display: boolean;
}

const MATH_TOKEN_RE = /%%MATH(\d+)%%/g;
const BLOCK_MATH_RE = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;
const CODE_SEGMENT_RE =
  /(`{3,}[\s\S]*?(?:`{3,}|$)|`+[^`\n]*?`+|\]\([^)\n]*\)|<\/?[a-zA-Z][^>\n]*>)/g;

const PROSE_LATEX_FIXES: Array<[RegExp, string]> = [
  [/\{,\}/g, ','],
  [/\\times\b/g, '×'],
  [/\\div\b/g, '÷'],
  [/\\cdot\b/g, '·'],
  [/\\pm\b/g, '±'],
  [/\\leq?\b/g, '≤'],
  [/\\geq?\b/g, '≥'],
  [/\\neq\b/g, '≠'],
  [/\\approx\b/g, '≈'],
  [/\\rightarrow\b/g, '→'],
  [/\\leftarrow\b/g, '←'],
  [/\\text\{([^{}]*)\}/g, '$1'],
  [/\\mathrm\{([^{}]*)\}/g, '$1'],
  [/\\%/g, '%'],
  [/\\,/g, ' '],
  [/\\\$/g, '$']
];

const stripMathDelims = (raw: string): string => {
  if (raw.startsWith('$$')) return raw.slice(2, -2).trim();
  if (raw.startsWith('\\[') || raw.startsWith('\\(')) return raw.slice(2, -2).trim();
  if (raw.startsWith('$')) return raw.slice(1, -1).trim();
  return raw;
};

const isInlineMathCandidate = (content: string): boolean => {
  if (!content || content !== content.trim()) return false;
  if (/[{}\\_^]/.test(content)) return true; // contains LaTeX syntax
  return /^[a-zA-Z]/.test(content); // "$x$" ok, "$100$" stays a price
};

const applyProseFixes = (text: string): string => {
  let out = text;
  for (const [re, replacement] of PROSE_LATEX_FIXES) {
    out = out.replace(re, replacement);
  }
  return out;
};

/** Pull math expressions out of prose, leaving code spans untouched. */
export const extractMath = (
  text: string
): { text: string; stash: MathSegment[] } => {
  const stash: MathSegment[] = [];
  const stashMath = (raw: string, display: boolean): string => {
    stash.push({ expr: stripMathDelims(raw), display });
    return `%%MATH${stash.length - 1}%%`;
  };

  const segments: Array<{ verbatim: boolean; text: string }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  CODE_SEGMENT_RE.lastIndex = 0;
  while ((match = CODE_SEGMENT_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ verbatim: false, text: text.slice(cursor, match.index) });
    }
    segments.push({ verbatim: true, text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ verbatim: false, text: text.slice(cursor) });

  const output = segments
    .map((seg) => {
      if (seg.verbatim) return seg.text;

      let t = seg.text;
      BLOCK_MATH_RE.lastIndex = 0;
      t = t.replace(BLOCK_MATH_RE, (raw) => stashMath(raw, /^(\$\$|\\\[)/.test(raw)));

      let out = '';
      let last = 0;
      INLINE_MATH_RE.lastIndex = 0;
      while ((match = INLINE_MATH_RE.exec(t)) !== null) {
        if (!isInlineMathCandidate(match[1] ?? '')) continue;
        out += t.slice(last, match.index) + stashMath(match[0], false);
        last = match.index + match[0].length;
        INLINE_MATH_RE.lastIndex = last;
      }
      out += t.slice(last);

      return applyProseFixes(out);
    })
    .join('');

  return { text: output, stash };
};

/** Render one extracted expression to KaTeX HTML (with a plain-text fallback). */
export const renderMath = ({ expr, display }: MathSegment): string => {
  // data-math keeps the source around so the Canvas editor can round-trip it
  const wrap = (inner: string): string =>
    `<span class="math-embed" data-math="${escapeHTML(expr)}" data-display="${
      display ? 1 : 0
    }">${inner}</span>`;

  try {
    return wrap(
      katex.renderToString(expr, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        maxSize: 600
      })
    );
  } catch {
    const source = display ? `\\[ ${expr} \\]` : `\\( ${expr} \\)`;
    return wrap(`<span class="math-unrendered">${escapeHTML(source)}</span>`);
  }
};

export const restoreMath = (html: string, stash: MathSegment[]): string => {
  if (!stash.length) return html;
  return html.replace(MATH_TOKEN_RE, (_m, i: string) =>
    renderMath(stash[Number(i)] ?? { expr: '', display: false })
  );
};
