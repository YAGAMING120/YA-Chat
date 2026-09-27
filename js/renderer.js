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
    if (window.katex) {
        try {
            return window.katex.renderToString(expr, {
                displayMode: display,
                throwOnError: false,
                strict: false,
                maxSize: 600
            });
        } catch (e) { /* fall through to plain-text fallback */ }
    }
    const source = display ? `\\[ ${expr} \\]` : `\\( ${expr} \\)`;
    return `<span class="math-unrendered">${escapeHTML(source)}</span>`;
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

export const renderMarkdown = (text) => {
    if (!text) return '';
    const { text: withMathTokens, stash } = extractMath(text);
    let html = '';
    if (window.marked && window.DOMPurify) {
        html = window.DOMPurify.sanitize(window.marked.parse(withMathTokens), {
            ADD_TAGS: ['use', 'svg', 'button'],
            ADD_ATTR: ['href', 'data-code', 'data-msg'],
            FORBID_TAGS: ['style', 'script']
        });
    } else {
        html = `<p>${escapeHTML(withMathTokens).replace(/\n/g, '<br/>')}</p>`;
    }
    if (stash.length) {
        html = html.replace(MATH_TOKEN_RE, (_, i) => renderMath(stash[Number(i)] || { expr: '', display: false }));
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
