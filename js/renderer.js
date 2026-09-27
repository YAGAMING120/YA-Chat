/**
 * Markdown rendering, code highlighting, message DOM builder
 */

export const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

// Set while the Canvas editor renders markdown (strips code-block buttons)
let plainCodeMode = false;

// ── Math (LaTeX) support ────────────────────────────────────────────────
// Math is extracted BEFORE markdown parsing (so marked/DOMPurify never
// mangle it) and re-injected as rendered KaTeX HTML AFTER sanitizing.

const MATH_TOKEN_RE = /%%MATH(\d+)%%/g;
const BLOCK_MATH_RE = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;
const CODE_SEGMENT_RE = /(`{3,}[\s\S]*?(?:`{3,}|$)|`+[^`\n]*?`+|\]\([^)\n]*\)|<\/?[a-zA-Z][^>\n]*>)/g;

const PROSE_LATEX_FIXES = [
    [/\{,\}/g, ','],
    [/\\times\b/g, '×'],
    [/\\div\b/g, '÷'],
    [/\\cdot\b/g, '·'],
    [/\\pm\b/g, '±'],
    [/\\leq?\b/g, '≤'],
    [/\\geq?\b/g, '≥'],
    [/\\neq?\b/g, '≠'],
    [/\\approx\b/g, '≈'],
    [/\\rightarrow\b/g, '→'],
    [/\\leftarrow\b/g, '←'],
    [/\\text\{([^{}]*)\}/g, '$1'],
    [/\\mathrm\{([^{}]*)\}/g, '$1'],
    [/\\%/g, '%'],
    [/\\,/g, ' '],
    [/\\\$/g, '$']
];

const stripMathDelims = (raw) => {
    if (raw.startsWith('$$')) return raw.slice(2, -2).trim();
    if (raw.startsWith('\\[') || raw.startsWith('\\(')) return raw.slice(2, -2).trim();
    if (raw.startsWith('$')) return raw.slice(1, -1).trim();
    return raw;
};

const isInlineMathCandidate = (content) => {
    if (!content || content !== content.trim()) return false;
    if (/[{}\\_^]/.test(content)) return true;   // contains LaTeX syntax
    return /^[a-zA-Z]/.test(content);            // "$x$" ok, "$100$" stays a price
};

const applyProseFixes = (text) => {
    let out = text;
    for (const [re, replacement] of PROSE_LATEX_FIXES) {
        out = out.replace(re, replacement);
    }
    return out;
};

const extractMath = (text) => {
    const stash = [];
    const stashMath = (raw, display) => {
        stash.push({ expr: stripMathDelims(raw), display });
        return `%%MATH${stash.length - 1}%%`;
    };

    const segments = [];
    let cursor = 0;
    let match;
    CODE_SEGMENT_RE.lastIndex = 0;
    while ((match = CODE_SEGMENT_RE.exec(text)) !== null) {
        if (match.index > cursor) segments.push({ verbatim: false, text: text.slice(cursor, match.index) });
        segments.push({ verbatim: true, text: match[0] });
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) segments.push({ verbatim: false, text: text.slice(cursor) });

    const output = segments.map(seg => {
        if (seg.verbatim) return seg.text;

        let t = seg.text;
        BLOCK_MATH_RE.lastIndex = 0;
        t = t.replace(BLOCK_MATH_RE, raw => stashMath(raw, /^(\$\$|\\\[)/.test(raw)));

        let out = '';
        let last = 0;
        INLINE_MATH_RE.lastIndex = 0;
        while ((match = INLINE_MATH_RE.exec(t)) !== null) {
            if (!isInlineMathCandidate(match[1])) continue;
            out += t.slice(last, match.index) + stashMath(match[0], false);
            last = match.index + match[0].length;
            INLINE_MATH_RE.lastIndex = last;
        }
        out += t.slice(last);

        return applyProseFixes(out);
    }).join('');

    return { text: output, stash };
};

const renderMath = ({ expr, display }) => {
    // data-math keeps the source around so the Canvas editor can round-trip it
    const wrap = (inner) => `<span class="math-embed" data-math="${escapeHTML(expr)}" data-display="${display ? 1 : 0}">${inner}</span>`;
    if (window.katex) {
        try {
            return wrap(window.katex.renderToString(expr, {
                displayMode: display,
                throwOnError: false,
                strict: false,
                maxSize: 600
            }));
        } catch (e) { /* fall through to plain-text fallback */ }
    }
    const source = display ? `\\[ ${expr} \\]` : `\\( ${expr} \\)`;
    return wrap(`<span class="math-unrendered">${escapeHTML(source)}</span>`);
};

if (window.marked) {
    window.marked.setOptions({
        highlight: function(code, lang) {
            try {
                const language = window.hljs.getLanguage(lang) ? lang : 'plaintext';
                return window.hljs.highlight(code, { language }).value;
            } catch (e) {
                return escapeHTML(code);
            }
        },
        langPrefix: 'hljs language-',
    });

    const renderer = new window.marked.Renderer();
    renderer.code = function(codeArg, langArg) {
        const text = typeof codeArg === 'object' ? codeArg.text : codeArg;
        const language = typeof codeArg === 'object' ? codeArg.lang : langArg;
        const langStr = language || 'text';
        let highlighted = text;
        try {
            highlighted = window.marked.defaults.highlight(text, langStr);
        } catch (e) {}

        if (plainCodeMode) {
            return `<pre><code class="hljs language-${escapeHTML(langStr)}">${highlighted}</code></pre>`;
        }

        const PREVIEWABLE = new Set(['html', 'svg', 'javascript', 'js', 'jsx', 'tsx', 'react']);
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
                <button class="btn-open-artifact" data-code="${encodeURIComponent(text)}" data-lang="${escapeHTML(langStr)}" title="${isPreviewable ? 'Run & preview in panel' : 'Open as file in panel'}">
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
    
    window.marked.use({ renderer });
}

// ── Canvas protocol ──────────────────────────────────────────────────────
// The model opens or updates the Canvas side panel by emitting:
//   <canvas title="..." type="doc|code" lang="js" action="replace|append|prepend">
//   ...content...
//   </canvas>
// Blocks are pulled out before markdown parsing and rendered as a chip.

const CANVAS_BLOCK_RE = /<canvas\b([^>]*)>([\s\S]*?)<\/canvas\s*>/gi;
const CANVAS_ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/g;
const CANVAS_TOKEN_RE = /%%CANVAS(\d+)%%/g;
const DOC_LANGS = new Set(['', 'doc', 'document', 'md', 'markdown', 'text', 'plaintext', 'txt', 'rich', 'richtext']);

const parseCanvasAttrs = (raw) => {
    const attrs = {};
    CANVAS_ATTR_RE.lastIndex = 0;
    let m;
    while ((m = CANVAS_ATTR_RE.exec(raw || '')) !== null) {
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    return attrs;
};

/** Work out whether a canvas block holds a document or a code file */
export const resolveCanvasType = (attrs = {}) => {
    const t = (attrs.type || '').toLowerCase();
    if (t === 'code' || t === 'file') return 'code';
    if (t === 'doc' || t === 'document' || t === 'text') return 'doc';
    const lang = (attrs.lang || attrs.language || '').toLowerCase();
    if (lang && !DOC_LANGS.has(lang)) return 'code';
    return 'doc';
};

/** Split canvas blocks out of a raw model reply (keeps %%CANVASn%% tokens) */
export const parseCanvasBlocks = (text) => {
    const blocks = [];
    if (!text) return { text: '', blocks };
    let out = String(text).replace(CANVAS_BLOCK_RE, (_, attrStr, content) => {
        blocks.push({
            attrs: parseCanvasAttrs(attrStr),
            content: content.replace(/^\n+|\n+$/g, '')
        });
        return `%%CANVAS${blocks.length - 1}%%`;
    });
    out = out.replace(/<canvas\b[\s\S]*$/i, ''); // drop an unfinished tail
    return { text: out, blocks };
};

/** While streaming: hide finished blocks, fade an unfinished one out of view */
export const stripCanvasForStream = (text) => {
    if (!text) return '';
    const raw = String(text);
    const opens = (raw.match(/<canvas\b/gi) || []).length;
    const closes = (raw.match(/<\/canvas\s*>/gi) || []).length;
    const { text: out } = parseCanvasBlocks(raw);
    return out.replace(CANVAS_TOKEN_RE, '') + (opens > closes ? '⋯' : '');
};

const canvasChipHTML = (block) => {
    const attrs = block.attrs || {};
    const isCode = resolveCanvasType(attrs) === 'code';
    const rawTitle = (attrs.title || '').trim();
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

/** Render markdown without the code-block action buttons (used by the Canvas editor) */
export const renderMarkdownPlain = (text) => {
    plainCodeMode = true;
    try {
        return renderMarkdown(text);
    } finally {
        plainCodeMode = false;
    }
};

export const renderMarkdown = (text) => {
    if (!text) return '';
    const canvasParts = parseCanvasBlocks(text);
    const { text: withMathTokens, stash } = extractMath(canvasParts.text);
    let html = '';
    if (window.marked && window.DOMPurify) {
        html = window.DOMPurify.sanitize(window.marked.parse(withMathTokens), {
            ADD_TAGS: ['use', 'svg', 'button'],
            ADD_ATTR: ['href', 'data-code', 'data-msg', 'data-canvas'],
            FORBID_TAGS: ['style', 'script']
        });
    } else {
        html = `<p>${escapeHTML(withMathTokens).replace(/\n/g, '<br/>')}</p>`;
    }
    if (stash.length) {
        html = html.replace(MATH_TOKEN_RE, (_, i) => renderMath(stash[Number(i)] || { expr: '', display: false }));
    }
    if (canvasParts.blocks.length) {
        html = html.replace(CANVAS_TOKEN_RE, (_, i) => canvasChipHTML(canvasParts.blocks[Number(i)] || { attrs: {}, content: '' }));
    }
    return html;
};

export const buildMessageDOM = (role, content, attachments = []) => {
    const isUser = role === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = isUser ? 'chat__message--user' : 'chat__message--ai';

    if (isUser) {
        let attachHtml = '';
        if (attachments && attachments.length > 0) {
            attachHtml = `<div class="msg-attachments">`;
            attachments.forEach(att => {
                if (att.type === 'image') {
                    attachHtml += `<img class="msg-attachment-img" src="${att.dataUrl}" alt="${escapeHTML(att.name)}" title="${escapeHTML(att.name)}">`;
                } else if (att.type === 'pdf') {
                    attachHtml += `<div class="msg-attachment-file msg-attachment-file--pdf">
                        <span class="msg-attachment-icon"><img src="assets/pdf-icon.svg" alt="PDF" style="width:24px;height:24px;"></span>
                        <div class="msg-attachment-meta">
                            <span class="msg-attachment-name">${escapeHTML(att.name || 'PDF Document')}</span>
                            <span class="msg-attachment-size">PDF Document</span>
                        </div>
                    </div>`;
                } else {
                    attachHtml += `<div class="msg-attachment-file">
                        <span class="msg-attachment-icon">${att.icon || '📎'}</span>
                        <div class="msg-attachment-meta">
                            <span class="msg-attachment-name">${escapeHTML(att.name)}</span>
                            <span class="msg-attachment-size">${att.sizeStr || ''}</span>
                        </div>
                    </div>`;
                }
            });
            attachHtml += `</div>`;
        }

        msgDiv.innerHTML = `
            <div class="chat__bubble--user">
                ${attachHtml}
                <div class="user-msg-text">${escapeHTML(content).replace(/\n/g, '<br/>')}</div>
                <div class="user-msg-actions">
                    <button class="btn-user-action btn-copy-user-msg" title="Copy message">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                    <button class="btn-user-action btn-edit-user-msg" title="Edit & resend">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                </div>
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="chat__avatar--ai">
                <img src="assets/ya-chat-logo.png" alt="YA Chat" class="ai-avatar-img">
            </div>
            <div class="chat__bubble--ai">
                <div class="chat__content">
                    ${content ? renderMarkdown(content) : ''}
                </div>
                <div class="chat__message-actions">
                    <button class="btn-action btn-copy-msg" data-msg="${encodeURIComponent(content)}">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Copy
                    </button>
                    <button class="btn-action btn-listen-msg" data-msg="${encodeURIComponent(content)}" title="Listen to this reply (text to speech)">
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        Listen
                    </button>
                    <button class="btn-action btn-regenerate">
                        <svg class="icon"><use href="#icon-refresh"></use></svg>
                        Regenerate
                    </button>
                    <div class="chat__message-meta"></div>
                </div>
            </div>
        `;
    }
    return msgDiv;
};
