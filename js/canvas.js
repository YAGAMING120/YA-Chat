/**
 * Canvas — ChatGPT-style side panel where the model opens an editable
 * document (rich text) or code file that the user and the model can keep
 * editing together.
 *
 * Protocol emitted by the model (documented in CANVAS_INSTRUCTION):
 *
 *   <canvas title="..." type="doc|code" lang="js" action="replace|append|prepend">
 *   ...content...
 *   </canvas>
 *
 * Events dispatched here:
 *   canvas-change   { canvas, wanted }        → persistence (chat.js)
 *   canvas-ai-edit  { instruction, selection } → chat.js sends the prompt
 *   canvas-open                             → artifact panel steps aside
 *
 * Events listened to here:
 *   artifact-open   → we step aside
 */
import { escapeHTML, renderMarkdownPlain, resolveCanvasType } from './renderer.js';
import { buildPreviewDoc, isPreviewable, LANG_EXT, LANG_MIME } from './artifact.js';
import { showToast } from './ui.js';

/* ────────────────────────────────────────────────────────────
   MODEL INSTRUCTIONS
   ──────────────────────────────────────────────────────────── */

export const CANVAS_INSTRUCTION = `CANVAS mode is ON. The user has a "Canvas" open beside the chat — a panel where they can edit the document or code you write.

To create or update it, include exactly ONE block like this somewhere in your reply:

<canvas title="Short descriptive title" type="doc" action="replace">
the full content goes here
</canvas>

Attributes:
- type: "doc" for rich-text/markdown documents (the default), "code" for source files — for code also add lang="javascript" (or python, html, etc.).
- action: "replace" (default) sets the canvas to exactly what you wrote; "append" adds to the end; "prepend" adds to the start.
- title: shown in the panel header.

Rules:
- Everything between the tags becomes the canvas content. Keep any normal chat prose outside the block.
- Never wrap the block in a code fence and never escape the markdown inside it.
- When the user asks you to edit the canvas, re-send the complete updated content in a new <canvas ... action="replace"> block instead of describing the changes.
- Do not put the block inside a list or heading — put it on its own line.
- Only use this block while canvas mode is on.`;

/** Context block appended to the system prompt while canvas mode is on */
export const buildCanvasContext = () => {
    if (!canvasWanted || !canvasState) return '';
    const lang = canvasState.type === 'code' ? ` lang="${escapeHTML(canvasState.lang || 'plaintext')}"` : '';
    return `<current_canvas title="${escapeHTML(canvasState.title || 'Untitled')}" type="${canvasState.type}"${lang}>
${canvasState.content || ''}
</current_canvas>

The block above is the CURRENT content of the canvas the user is editing. Treat it as the source of truth for any edit they ask for.`;
};

/* ────────────────────────────────────────────────────────────
   STATE
   ──────────────────────────────────────────────────────────── */

/** { title, type: 'doc'|'code', lang, content, updatedAt } */
let canvasState = null;
let canvasWanted = false;
let view = 'main';                 // 'main' = editor, 'alt' = source / preview
let dirty = { doc: true, source: true, code: true };
let saveTimer = null;

const el = (id) => document.getElementById(id);

const emitChange = () => {
    document.dispatchEvent(new CustomEvent('canvas-change', {
        detail: { canvas: canvasState ? { ...canvasState } : null, wanted: canvasWanted }
    }));
};

const scheduleEmit = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(emitChange, 400);
};

/* ────────────────────────────────────────────────────────────
   MARKDOWN ⇄ EDITABLE HTML
   ──────────────────────────────────────────────────────────── */

const inlineMd = (node) => {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';

    const tag = node.tagName;
    const kids = () => Array.from(node.childNodes).map(inlineMd).join('');
    const wrap = (mark) => { const t = kids().trim(); return t ? mark + t + mark : ''; };

    if (node.getAttribute && node.hasAttribute('data-math')) {
        const expr = node.getAttribute('data-math');
        const display = node.getAttribute('data-display') === '1';
        return display ? `\n\n$$${expr}$$\n\n` : `$${expr}$`;
    }

    switch (tag) {
        case 'STRONG': case 'B': return wrap('**');
        case 'EM': case 'I': return wrap('*');
        case 'DEL': case 'S': case 'STRIKE': return wrap('~~');
        case 'CODE': return '`' + node.textContent + '`';
        case 'A': {
            const href = node.getAttribute('href') || '';
            const t = kids();
            return href ? `[${t}](${href})` : t;
        }
        case 'BR': return '\n';
        case 'IMG': {
            const src = node.getAttribute('src') || '';
            return src ? `![${node.getAttribute('alt') || ''}](${src})` : '';
        }
        case 'UL': case 'OL': case 'PRE': case 'BLOCKQUOTE': case 'TABLE': {
            // Block-level element reached through inline traversal: keep raw text
            return node.textContent;
        }
        default: return kids();
    }
};

const tableMd = (table) => {
    const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
        Array.from(tr.children).map(cell =>
            cell.textContent.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()
        )
    ).filter(r => r.length);
    if (!rows.length) return table.textContent.trim();
    const head = rows[0];
    return [
        `| ${head.join(' | ')} |`,
        `| ${head.map(() => '---').join(' | ')} |`,
        ...rows.slice(1).map(r => `| ${r.join(' | ')} |`)
    ].join('\n');
};

const blockMd = (node, out) => {
    Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
            const t = child.nodeValue.replace(/\s+/g, ' ').trim();
            if (t) out.push(t, '');
            return;
        }
        if (child.nodeType !== 1) return;

        const tag = child.tagName;
        const heading = /^H[1-6]$/.test(tag);
        if (heading) {
            out.push('#'.repeat(Number(tag[1])) + ' ' + inlineMd(child).trim());
            out.push('');
        } else if (tag === 'UL' || tag === 'OL') {
            Array.from(child.children).filter(li => li.tagName === 'LI').forEach((li, i) => {
                const prefix = tag === 'OL' ? `${i + 1}. ` : '- ';
                const lines = inlineMd(li).split('\n');
                lines.forEach((line, j) => out.push((j === 0 ? prefix : '   ') + line));
            });
            out.push('');
        } else if (tag === 'BLOCKQUOTE') {
            const inner = [];
            blockMd(child, inner);
            const text = inner.join('\n').replace(/\n+$/, '');
            text.split('\n').forEach(line => out.push('> ' + line));
            out.push('');
        } else if (tag === 'PRE') {
            const codeEl = child.querySelector('code');
            const langMatch = ((codeEl && codeEl.className) || '').match(/language-([\w+#-]+)/);
            out.push('```' + (langMatch ? langMatch[1] : ''));
            out.push((codeEl || child).textContent.replace(/\n+$/, ''));
            out.push('```');
            out.push('');
        } else if (tag === 'TABLE') {
            out.push(tableMd(child));
            out.push('');
        } else if (tag === 'HR') {
            out.push('---');
            out.push('');
        } else if (tag === 'BR') {
            out.push('');
        } else if (child.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table,div')) {
            blockMd(child, out);
        } else {
            const t = inlineMd(child).trim();
            if (t) t.split('\n').forEach(line => { if (line.trim()) out.push(line.trim(), ''); });
        }
    });
};

const htmlToMarkdown = (root) => {
    const out = [];
    blockMd(root, out);
    return out.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

/* ────────────────────────────────────────────────────────────
   RENDERING
   ──────────────────────────────────────────────────────────── */

const refreshHighlight = () => {
    const codeEl = el('canvas-code-hl');
    const ta = el('canvas-code-input');
    if (!codeEl || !ta) return;
    const lang = ((canvasState && canvasState.lang) || 'plaintext').toLowerCase();
    let html = escapeHTML(ta.value);
    try {
        if (window.hljs) {
            const valid = window.hljs.getLanguage(lang) ? lang : 'plaintext';
            html = window.hljs.highlight(ta.value, { language: valid }).value;
        }
    } catch (e) { html = escapeHTML(ta.value); }
    codeEl.className = `hljs language-${lang}`;
    codeEl.innerHTML = html;
};

const renderPreview = () => {
    const frame = el('canvas-preview-frame');
    const errBox = el('canvas-preview-error');
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }
    if (!frame || !canvasState) return;
    const doc = buildPreviewDoc({ lang: canvasState.lang, code: canvasState.content || '' });
    frame.srcdoc = doc == null
        ? '<!doctype html><html><body style="font-family:sans-serif;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">No live preview available for this file type.</body></html>'
        : doc;
};

const updateStats = () => {
    const s = el('canvas-stats');
    if (!s) return;
    if (!canvasState) { s.textContent = ''; return; }
    const c = canvasState.content || '';
    if (canvasState.type === 'doc') {
        const words = c.trim() ? c.trim().split(/\s+/).length : 0;
        s.textContent = `${words.toLocaleString()} words · ${c.length.toLocaleString()} characters`;
    } else {
        s.textContent = `${c.split('\n').length.toLocaleString()} lines · ${c.length.toLocaleString()} characters`;
    }
};

const closeAskMenu = () => {
    const menu = el('canvas-ask-menu');
    if (menu) { menu.style.display = 'none'; menu.innerHTML = ''; }
    el('canvas-btn-ask')?.classList.remove('artifact-btn--active');
};

const hideSelToolbar = () => {
    const tb = el('canvas-sel-toolbar');
    if (tb) tb.style.display = 'none';
};

const render = () => {
    const panel = el('canvas-panel');
    if (!panel) return;

    panel.classList.toggle('canvas-panel--open', canvasWanted);
    document.getElementById('app')?.classList.toggle('app--canvas-open', canvasWanted);
    closeAskMenu();
    hideSelToolbar();
    if (!canvasWanted) return;

    const st = canvasState;
    const has = !!st;
    const doc = el('canvas-doc');
    const source = el('canvas-source');
    const code = el('canvas-code');
    const frame = el('canvas-preview-frame');
    const toolbar = el('canvas-toolbar');
    const toggle = el('canvas-viewtoggle');
    const empty = el('canvas-empty');

    [doc, source, code, frame].forEach(node => { if (node) node.style.display = 'none'; });
    const errBox = el('canvas-preview-error');
    if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }
    if (toolbar) toolbar.style.display = 'none';
    if (empty) empty.style.display = has ? 'none' : 'flex';
    if (toggle) toggle.style.display = 'none';

    if (!has) {
        const titleInput = el('canvas-title-input');
        if (titleInput) titleInput.value = '';
        const badge = el('canvas-badge');
        if (badge) { badge.textContent = 'Canvas'; badge.className = 'canvas-panel__badge'; }
        updateStats();
        return;
    }

    const isDoc = st.type === 'doc';
    const titleInput = el('canvas-title-input');
    if (titleInput && document.activeElement !== titleInput) titleInput.value = st.title || '';
    const badge = el('canvas-badge');
    if (badge) {
        badge.textContent = isDoc ? 'DOC' : String(st.lang || 'code').toUpperCase();
        badge.className = 'canvas-panel__badge' + (isDoc ? '' : ' canvas-panel__badge--code');
    }

    const altOK = isDoc || isPreviewable(st.lang);
    if (view === 'alt' && !altOK) view = 'main';
    if (toggle) toggle.style.display = altOK ? 'flex' : 'none';

    const btnMain = el('canvas-btn-view-main');
    const btnAlt = el('canvas-btn-view-alt');
    if (btnMain) {
        btnMain.textContent = isDoc ? 'Write' : 'Code';
        btnMain.classList.toggle('is-active', view === 'main');
    }
    if (btnAlt) {
        btnAlt.textContent = isDoc ? 'Source' : 'Preview';
        btnAlt.classList.toggle('is-active', view === 'alt');
    }

    if (isDoc) {
        if (view === 'main') {
            doc.style.display = 'block';
            if (toolbar) toolbar.style.display = 'flex';
            if (dirty.doc) { doc.innerHTML = renderMarkdownPlain(st.content || ''); dirty.doc = false; }
        } else {
            source.style.display = 'block';
            if (dirty.source) { source.value = st.content || ''; dirty.source = false; }
        }
    } else {
        if (view === 'main') {
            code.style.display = 'block';
            if (dirty.code) {
                const ta = el('canvas-code-input');
                if (ta) ta.value = st.content || '';
                dirty.code = false;
                refreshHighlight();
            }
        } else {
            frame.style.display = 'block';
            renderPreview();
        }
    }
    updateStats();
};

/* ────────────────────────────────────────────────────────────
   STATE MUTATION
   ──────────────────────────────────────────────────────────── */

const deriveTitle = (type, lang, content) => {
    if (type === 'doc') {
        const m = /^#\s+(.+)$/m.exec(content || '');
        if (m) return m[1].replace(/[*_`]/g, '').trim().slice(0, 70);
        return 'Untitled document';
    }
    return lang ? `${lang} file` : 'Code';
};

/** Apply one <canvas> block emitted by the model */
export const applyCanvasBlock = (block) => {
    const attrs = (block && block.attrs) || {};
    const content = ((block && block.content) || '').replace(/^\n+|\n+$/g, '');
    const type = resolveCanvasType(attrs);
    const langAttr = String(attrs.lang || attrs.language || '').toLowerCase();
    const action = String(attrs.action || 'replace').toLowerCase();
    const title = String(attrs.title || '').trim();

    if (!canvasState || canvasState.type !== type || action === 'replace') {
        const lang = type === 'code' ? (langAttr || 'javascript') : 'markdown';
        canvasState = {
            title: title || deriveTitle(type, lang, content),
            type,
            lang,
            content,
            updatedAt: Date.now()
        };
    } else {
        if (title) canvasState.title = title;
        if (type === 'code' && langAttr) canvasState.lang = langAttr;
        const sep = type === 'code' ? '\n' : '\n\n';
        if (action === 'append') {
            canvasState.content = canvasState.content ? canvasState.content.replace(/\s+$/, '') + sep + content : content;
        } else if (action === 'prepend') {
            canvasState.content = content ? content + sep + canvasState.content.replace(/^\s+/, '') : canvasState.content;
        } else {
            canvasState.content = content;
        }
        canvasState.updatedAt = Date.now();
    }

    view = 'main';
    dirty = { doc: true, source: true, code: true };
    setCanvasWanted(true);
    emitChange(); // panel may already have been open — persist the new content
};

/** Chip in a chat message was clicked */
export const openCanvasFromChip = (block) => {
    if (canvasState) {
        setCanvasWanted(true);
    } else {
        applyCanvasBlock(block);
    }
};

/** Re-hydrate when switching chats (also notifies chat.js to persist) */
export const restoreCanvas = (state, wanted) => {
    canvasState = state ? { ...state } : null;
    canvasWanted = !!wanted;
    view = 'main';
    dirty = { doc: true, source: true, code: true };
    render();
    emitChange();
};

export const getCanvasState = () => (canvasState ? { ...canvasState } : null);
export const isCanvasWanted = () => canvasWanted;

export const setCanvasWanted = (next) => {
    const value = !!next;
    const changed = value !== canvasWanted;
    canvasWanted = value;
    render();
    if (changed) {
        emitChange();
        if (canvasWanted) document.dispatchEvent(new CustomEvent('canvas-open'));
    }
};

/* ────────────────────────────────────────────────────────────
   EDIT-WITH-AI MENU + SELECTION TOOLBAR
   ──────────────────────────────────────────────────────────── */

const MENU_ITEMS = {
    doc: [
        ['Make shorter', 'Make the following text noticeably shorter while keeping every key point.'],
        ['Make longer', 'Expand the following text with more detail, depth, and examples.'],
        ['Fix grammar', 'Fix all grammar, spelling, and punctuation mistakes in the following text.'],
        ['Improve writing', 'Improve the clarity, flow, and word choice of the following text.'],
        ['Add detail', 'Add concrete details and examples to the following text.'],
        ['Add comments', 'Give feedback and improvement suggestions on the following text as comments.'],
        ['Add emojis', 'Add fitting emojis to the following text without changing its meaning.'],
    ],
    code: [
        ['Find bugs', 'Review the following code for bugs and correctness problems. List each issue and its fix.'],
        ['Optimize', 'Optimize the following code for performance and readability.'],
        ['Add comments', 'Add concise, helpful comments to the following code.'],
        ['Write tests', 'Write unit tests for the following code.'],
        ['Explain', 'Briefly explain what the following code does.'],
        ['Refactor', 'Refactor the following code into a cleaner, more idiomatic version.'],
    ],
};

const requestAIEdit = (instruction, selection) => {
    if (!instruction) return;
    document.dispatchEvent(new CustomEvent('canvas-ai-edit', {
        detail: { instruction, selection: selection || '' }
    }));
};

const openAskMenu = () => {
    const menu = el('canvas-ask-menu');
    const btn = el('canvas-btn-ask');
    if (!menu) return;
    if (menu.style.display === 'block') { closeAskMenu(); return; }

    const kind = canvasState && canvasState.type === 'code' ? 'code' : 'doc';
    menu.innerHTML = MENU_ITEMS[kind].map(([label, instruction]) =>
        `<button type="button" class="canvas-menu__item" data-instruction="${escapeHTML(instruction)}">${escapeHTML(label)}</button>`
    ).join('');
    menu.style.display = 'block';
    btn?.classList.add('artifact-btn--active');

    menu.querySelectorAll('.canvas-menu__item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const instruction = item.dataset.instruction;
            const useSelection = kind === 'doc' && lastSelection;
            closeAskMenu();
            requestAIEdit(instruction, useSelection ? lastSelection : '');
        });
    });
};

let lastSelection = '';

const updateSelToolbar = () => {
    const tb = el('canvas-sel-toolbar');
    const doc = el('canvas-doc');
    if (!tb || !doc) return;

    if (!canvasWanted || !canvasState || canvasState.type !== 'doc' || view !== 'main') {
        hideSelToolbar();
        return;
    }
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideSelToolbar(); return; }

    const range = sel.getRangeAt(0);
    if (!doc.contains(range.commonAncestorContainer)) { hideSelToolbar(); return; }

    const text = sel.toString().trim();
    if (!text) { hideSelToolbar(); return; }

    lastSelection = text;
    const rect = range.getBoundingClientRect();
    tb.style.display = 'flex';
    const tbW = tb.offsetWidth || 240;
    const tbH = tb.offsetHeight || 34;
    let left = rect.left + rect.width / 2 - tbW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tbW - 8));
    let top = rect.top - tbH - 8;
    if (top < 56) top = rect.bottom + 8;
    tb.style.left = `${Math.round(left)}px`;
    tb.style.top = `${Math.round(top)}px`;
};

/* ────────────────────────────────────────────────────────────
   INIT
   ──────────────────────────────────────────────────────────── */

export const initCanvasPanel = () => {
    const doc = el('canvas-doc');
    const source = el('canvas-source');
    const codeInput = el('canvas-code-input');
    const codeHl = el('canvas-code-hl');

    el('canvas-btn-close')?.addEventListener('click', () => setCanvasWanted(false));

    el('canvas-btn-copy')?.addEventListener('click', () => {
        if (!canvasState) return;
        navigator.clipboard.writeText(canvasState.content || '');
        showToast('Canvas content copied', 'success');
    });

    el('canvas-btn-download')?.addEventListener('click', () => {
        if (!canvasState) return;
        const isDoc = canvasState.type === 'doc';
        const ext = isDoc ? 'md' : (LANG_EXT[(canvasState.lang || '').toLowerCase()] || 'txt');
        const mime = isDoc ? 'text/markdown' : (LANG_MIME[ext] || 'text/plain');
        const base = (canvasState.title || 'canvas').replace(/[^\w\d\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'canvas';
        const blob = new Blob([canvasState.content || ''], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    });

    // Title
    const titleInput = el('canvas-title-input');
    titleInput?.addEventListener('change', () => {
        if (!canvasState) return;
        canvasState.title = titleInput.value.trim() || deriveTitle(canvasState.type, canvasState.lang, canvasState.content);
        titleInput.value = canvasState.title;
        scheduleEmit();
    });
    titleInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); }
    });

    // Edit-with-AI menu
    el('canvas-btn-ask')?.addEventListener('click', (e) => { e.stopPropagation(); openAskMenu(); });
    document.addEventListener('click', (e) => {
        const menu = el('canvas-ask-menu');
        if (!menu || menu.style.display !== 'block') return;
        if (menu.contains(e.target) || el('canvas-btn-ask')?.contains(e.target)) return;
        closeAskMenu();
    });

    // View toggle (Write/Source, Code/Preview)
    el('canvas-btn-view-main')?.addEventListener('click', () => { view = 'main'; render(); });
    el('canvas-btn-view-alt')?.addEventListener('click', () => { view = 'alt'; render(); });

    // Formatting toolbar (doc)
    const toolbar = el('canvas-toolbar');
    toolbar?.querySelectorAll('button[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            const val = btn.dataset.val || null;
            doc?.focus();
            try {
                if (cmd === 'formatBlock') document.execCommand('formatBlock', false, `<${val}>`);
                else if (cmd === 'createLink') {
                    const url = prompt('Link URL');
                    if (url) document.execCommand('createLink', false, url);
                } else if (cmd === 'inlineCode') {
                    const selected = String(document.getSelection() || '');
                    document.execCommand('insertHTML', false, `<code>${escapeHTML(selected || 'code')}</code>`);
                } else {
                    document.execCommand(cmd, false, val);
                }
            } catch (e) { /* command unsupported — ignore */ }
            if (canvasState && doc) {
                canvasState.content = htmlToMarkdown(doc);
                dirty.source = true;
                updateStats();
                scheduleEmit();
            }
        });
    });

    // WYSIWYG editor
    doc?.addEventListener('input', () => {
        if (!canvasState) return;
        canvasState.content = htmlToMarkdown(doc);
        dirty.source = true;
        updateStats();
        scheduleEmit();
    });
    doc?.addEventListener('paste', (e) => {
        e.preventDefault();
        const html = e.clipboardData?.getData('text/html');
        const text = e.clipboardData?.getData('text/plain') || '';
        if (html && window.DOMPurify) {
            document.execCommand('insertHTML', false, window.DOMPurify.sanitize(html, {
                FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed']
            }));
        } else {
            document.execCommand('insertText', false, text);
        }
    });

    // Markdown source editor
    source?.addEventListener('input', () => {
        if (!canvasState) return;
        canvasState.content = source.value;
        dirty.doc = true;
        updateStats();
        scheduleEmit();
    });

    // Code editor (highlighted overlay)
    codeInput?.addEventListener('input', () => {
        if (!canvasState) return;
        canvasState.content = codeInput.value;
        refreshHighlight();
        updateStats();
        scheduleEmit();
    });
    codeInput?.addEventListener('scroll', () => {
        if (codeHl) {
            codeHl.scrollTop = codeInput.scrollTop;
            codeHl.scrollLeft = codeInput.scrollLeft;
        }
    });
    codeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertText', false, '    ');
        }
    });

    // Selection toolbar
    document.addEventListener('selectionchange', () => {
        requestAnimationFrame(updateSelToolbar);
    });
    const selToolbar = el('canvas-sel-toolbar');
    selToolbar?.querySelectorAll('button[data-sel]').forEach(btn => {
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
            const instructions = {
                shorter: 'Make the selected text shorter without losing its meaning.',
                longer: 'Expand the selected text with more detail.',
                grammar: 'Fix grammar, spelling, and punctuation in the selected text.',
                improve: 'Rewrite the selected text so it is clearer and reads better.',
            };
            const selection = lastSelection;
            hideSelToolbar();
            requestAIEdit(instructions[btn.dataset.sel] || 'Edit the selected text.', selection);
        });
    });

    // Preview errors from the sandboxed iframe
    window.addEventListener('message', (e) => {
        if (!e.data || !e.data.__artifactError) return;
        const box = el('canvas-preview-error');
        if (!box || !canvasWanted || view !== 'alt' || !canvasState || canvasState.type !== 'code') return;
        box.style.display = 'block';
        box.textContent = e.data.message + (e.data.stack ? '\n\n' + e.data.stack : '');
    });

    // Step aside for the artifact panel
    document.addEventListener('artifact-open', () => {
        if (canvasWanted) setCanvasWanted(false);
    });

    render();
    console.log('Canvas initialized');
};
