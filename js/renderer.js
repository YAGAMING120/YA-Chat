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

        return `
    <div class="code-block-wrapper">
        <div class="code-block-header">
            <span class="code-lang">${escapeHTML(langStr)}</span>
            <div class="code-block-actions">
                <button class="btn-open-artifact" data-code="${encodeURIComponent(text)}" data-lang="${escapeHTML(langStr)}" title="Open as file in panel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Open as File
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
    let rawHtml = '';
    if (window.marked && window.DOMPurify) {
        rawHtml = window.marked.parse(text);
        return window.DOMPurify.sanitize(rawHtml, {
            ADD_TAGS: ['use', 'svg', 'button'],
            ADD_ATTR: ['href', 'data-code', 'data-msg'],
            FORBID_TAGS: ['style', 'script']
        });
    } else {
        return `<p>${escapeHTML(text).replace(/\n/g, '<br/>')}</p>`;
    }
};

export const buildMessageDOM = (role, content, attachments = []) => {
    const isUser = role === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = isUser ? 'chat__message--user' : 'chat__message--ai';

    if (isUser) {
        // Build attachment previews if any
        let attachHtml = '';
        if (attachments && attachments.length > 0) {
            attachHtml = `<div class="msg-attachments">`;
            attachments.forEach(att => {
                if (att.type === 'image') {
                    attachHtml += `<img class="msg-attachment-img" src="${att.dataUrl}" alt="${escapeHTML(att.name)}" title="${escapeHTML(att.name)}">`;
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
