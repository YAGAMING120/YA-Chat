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
            <button class="btn-copy-code" data-code="${encodeURIComponent(text)}">
                Copy
            </button>
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

export const buildMessageDOM = (role, content) => {
    const isUser = role === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = isUser ? 'chat__message--user' : 'chat__message--ai';
    
    if (isUser) {
        msgDiv.innerHTML = `
            <div class="chat__bubble--user">
                ${escapeHTML(content).replace(/\n/g, '<br/>')}
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="chat__avatar--ai">AI</div>
            <div class="chat__bubble--ai">
                <div class="chat__content">
                    ${renderMarkdown(content)}
                </div>
                <div class="chat__message-actions">
                    <button class="btn-action btn-copy-msg" data-msg="${encodeURIComponent(content)}">
                        <svg class="icon"><use href="#icon-menu"></use></svg>
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
