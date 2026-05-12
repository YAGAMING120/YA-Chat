/**
 * Chat logic (send, receive, history, sessions)
 */
import { getSessionList, getSession, saveSession, deleteSession, getProjectList, saveProject, getProject, deleteProject } from './storage.js';
import { getSettings, setThinkingEnabled } from './settings.js';
import { getSelectedModelId } from './models.js';
import { sendChatCompletion } from './api.js';
import { buildMessageDOM, escapeHTML, renderMarkdown } from './renderer.js';
import { closeSidebarMobile } from './ui.js';
import { openArtifact, initArtifactPanel } from './artifact.js';

let currentSession = null;
let pendingAttachments = [];
let activeProjectId = null; // currently selected project filter

// ── Project helpers ───────────────────────────────────────────────────────

/** Render the project list in the sidebar */
export const renderProjectList = () => {
    const container = document.getElementById('project-list');
    if (!container) return;
    container.innerHTML = '';
    const projects = getProjectList();
    if (projects.length === 0) {
        container.innerHTML = `<div class="project-empty">No projects yet</div>`;
        return;
    }
    projects.forEach(project => {
        const div = document.createElement('div');
        div.className = `project-item ${activeProjectId === project.id ? 'project-item--active' : ''}`;
        div.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            <span class="project-item__name">${escapeHTML(project.name)}</span>
            <div class="project-item__actions">
                <button class="btn-icon btn-delete-project" title="Delete project">
                    <svg class="icon"><use href="#icon-trash"></use></svg>
                </button>
            </div>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-project')) return;
            activeProjectId = activeProjectId === project.id ? null : project.id;
            renderProjectList();
            renderSidebarList();
        });
        div.querySelector('.btn-delete-project').addEventListener('click', (e) => {
            e.stopPropagation();
            showInlineConfirm(e.currentTarget, `Delete "${project.name}" and all its chats?`, () => {
                deleteProject(project.id);
                if (activeProjectId === project.id) {
                    activeProjectId = null;
                    createNewChat();
                }
                renderProjectList();
                renderSidebarList();
            });
        });
        container.appendChild(div);
    });
};

/** Show a modal to create a new project */
const showNewProjectModal = () => {
    const existing = document.getElementById('new-project-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'new-project-modal';
    modal.className = 'inline-project-modal';
    modal.innerHTML = `
        <div class="inline-project-modal__box">
            <h3>New Project</h3>
            <input type="text" id="new-project-name" class="form-input" placeholder="Project name..." maxlength="40" autofocus>
            <textarea id="new-project-prompt" class="form-input form-textarea" rows="3" placeholder="Project system prompt (optional)…"></textarea>
            <div class="inline-project-modal__actions">
                <button class="btn-edit-save" id="btn-create-project">Create</button>
                <button class="btn-edit-cancel" id="btn-cancel-project">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('new-project-name').focus();

    document.getElementById('btn-cancel-project').addEventListener('click', () => modal.remove());
    document.getElementById('btn-create-project').addEventListener('click', () => {
        const name = document.getElementById('new-project-name').value.trim();
        if (!name) return;
        const prompt = document.getElementById('new-project-prompt').value.trim();
        const project = { id: Date.now().toString(), name, systemPrompt: prompt, timestamp: Date.now() };
        saveProject(project);
        activeProjectId = project.id;
        modal.remove();
        renderProjectList();
        renderSidebarList();
    });
    // Close on backdrop click
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}; // [{name, type, dataUrl, base64, mimeType}]

/** File type classification */
const FILE_TYPES = {
    image:   ['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff'],
    text:    ['txt','md','markdown','csv','json','jsonl','xml','yaml','yml','toml','ini',
              'js','ts','jsx','tsx','py','java','c','cpp','cs','go','rs','rb','php',
              'swift','kt','lua','luau','sh','bash','zsh','html','css','scss','sass',
              'sql','graphql','env','gitignore','dockerfile','makefile','r','dart','vue','svelte'],
    archive: ['zip','rar','7z','tar','gz','bz2','xz','jar','war','ear','apk','ipa'],
    binary:  ['exe','dll','so','bin','dat','db','sqlite','class','wasm'],
    doc:     ['pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods'],
};

/** Get category for a file by extension */
const getFileCategory = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    for (const [cat, exts] of Object.entries(FILE_TYPES)) {
        if (exts.includes(ext)) return cat;
    }
    return 'unknown';
};

/** Get a friendly icon for a file category */
const getFileIcon = (category, ext) => {
    const icons = {
        image: '🖼️', text: '📄', archive: '🗜️',
        binary: '⚙️', doc: '📋', unknown: '📎'
    };
    const extIcons = { pdf:'📕', csv:'📊', json:'📋', sql:'🗄️',
        py:'🐍', js:'📜', html:'🌐', jar:'☕', zip:'🗜️', apk:'📱' };
    return extIcons[ext] || icons[category] || '📎';
};

/** Format bytes to human readable */
const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
};

/** Read a file and return a structured attachment object */
const readFileAsAttachment = (file) => new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const category = getFileCategory(file.name);
    const icon = getFileIcon(category, ext);
    const sizeStr = formatBytes(file.size);

    const base = { name: file.name, ext, category, icon, size: file.size, sizeStr, mimeType: file.type || 'application/octet-stream' };

    if (category === 'image') {
        // Read as dataURL for display + sending
        const reader = new FileReader();
        reader.onload = (e) => resolve({ ...base, type: 'image', dataUrl: e.target.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);

    } else if (category === 'text') {
        // Read as plain text — send actual content to AI
        if (file.size > 500 * 1024) {
            // Too large to send (>500KB) — send truncated
            const reader = new FileReader();
            reader.onload = (e) => resolve({
                ...base, type: 'text',
                content: e.target.result.slice(0, 50000) + '\n\n[... file truncated at 50,000 chars ...]'
            });
            reader.onerror = reject;
            reader.readAsText(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => resolve({ ...base, type: 'text', content: e.target.result });
            reader.onerror = reject;
            reader.readAsText(file);
        }

    } else {
        // Archive, binary, doc, unknown — send metadata only
        resolve({ ...base, type: 'meta' });
    }
});

/** Renders the pending attachment strip above the input */
const renderFilePreviewStrip = () => {
    const strip = document.getElementById('file-preview-strip');
    if (!strip) return;
    strip.innerHTML = '';
    if (pendingAttachments.length === 0) { strip.style.display = 'none'; return; }
    strip.style.display = 'flex';
    pendingAttachments.forEach((att, idx) => {
        const chip = document.createElement('div');
        chip.className = `file-chip file-chip--${att.category || 'unknown'}`;
        if (att.type === 'image') {
            chip.innerHTML = `<img src="${att.dataUrl}" class="file-chip__thumb" alt="${escapeHTML(att.name)}">
                <div class="file-chip__info"><span class="file-chip__name">${escapeHTML(att.name)}</span><span class="file-chip__size">${att.sizeStr}</span></div>
                <button class="file-chip__remove" data-idx="${idx}">✕</button>`;
        } else {
            chip.innerHTML = `<span class="file-chip__icon">${att.icon}</span>
                <div class="file-chip__info"><span class="file-chip__name">${escapeHTML(att.name)}</span><span class="file-chip__size">${att.sizeStr}</span></div>
                <button class="file-chip__remove" data-idx="${idx}">✕</button>`;
        }
        chip.querySelector('.file-chip__remove').addEventListener('click', () => {
            pendingAttachments.splice(idx, 1);
            renderFilePreviewStrip();
        });
        strip.appendChild(chip);
    });
};

export const initChat = () => {
    console.log('Chat initialized');

    initArtifactPanel();

    // ── Project system ────────────────────────────────────────────────────
    document.getElementById('btn-new-project')?.addEventListener('click', showNewProjectModal);
    renderProjectList();

    // ── Thinking mode toggle ──────────────────────────────────────────────
    const btnThinking = document.getElementById('btn-thinking-toggle');
    const updateThinkingBtn = () => {
        const enabled = getSettings().thinkingEnabled;
        btnThinking?.classList.toggle('btn-tool--active', enabled);
        if (btnThinking) btnThinking.title = enabled ? 'Thinking ON — click to disable' : 'Thinking OFF — click to enable';
    };
    btnThinking?.addEventListener('click', () => {
        setThinkingEnabled(!getSettings().thinkingEnabled);
        updateThinkingBtn();
    });
    updateThinkingBtn();

    document.getElementById('btn-new-chat')?.addEventListener('click', createNewChat);
    
    const input = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    
    btnSend?.addEventListener('click', handleSend);
    
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // File attach button
    const btnAttach = document.getElementById('btn-attach-file');
    const fileInput = document.getElementById('file-input');
    btnAttach?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            const att = await readFileAsAttachment(file);
            pendingAttachments.push(att);
        }
        renderFilePreviewStrip();
        fileInput.value = ''; // reset so same file can be re-added
    });

    const list = getSessionList();
    if (list.length > 0) {
        loadSessionUI(list[0].id);
    } else {
        createNewChat();
    }
    
    renderSidebarList();
    
    // Global event delegation
    document.addEventListener('click', (e) => {
        const openArtifactBtn = e.target.closest('.btn-open-artifact');
        if (openArtifactBtn) {
            const code = decodeURIComponent(openArtifactBtn.dataset.code || '');
            const lang = openArtifactBtn.dataset.lang || 'text';
            openArtifact(code, lang);
        }

        const copyCodeBtn = e.target.closest('.btn-copy-code');
        if (copyCodeBtn) {
            const rawCode = copyCodeBtn.dataset.code;
            if (rawCode) {
                navigator.clipboard.writeText(decodeURIComponent(rawCode));
                copyCodeBtn.textContent = 'Copied!';
                setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
            }
        }
        
        const copyMsgBtn = e.target.closest('.btn-copy-msg');
        if (copyMsgBtn) {
            const rawMsg = copyMsgBtn.dataset.msg;
            if (rawMsg) {
                navigator.clipboard.writeText(decodeURIComponent(rawMsg));
                const orig = copyMsgBtn.innerHTML;
                copyMsgBtn.innerHTML = 'Copied!';
                setTimeout(() => copyMsgBtn.innerHTML = orig, 2000);
            }
        }

        // Copy user message
        const copyUserBtn = e.target.closest('.btn-copy-user-msg');
        if (copyUserBtn) {
            const bubble = copyUserBtn.closest('.chat__bubble--user');
            const textEl = bubble?.querySelector('.user-msg-text');
            if (textEl) {
                navigator.clipboard.writeText(textEl.innerText);
                copyUserBtn.style.color = 'var(--text-primary)';
                setTimeout(() => copyUserBtn.style.color = '', 1500);
            }
        }

        // Edit user message
        const editUserBtn = e.target.closest('.btn-edit-user-msg');
        if (editUserBtn) {
            const msgDiv = editUserBtn.closest('.chat__message--user');
            startEditUserMessage(msgDiv);
        }
        
        const promptCard = e.target.closest('.prompt-card');
        if (promptCard) {
            const prompt = promptCard.dataset.prompt;
            if (prompt && input) {
                input.value = prompt;
                handleSend();
            }
        }
        
        const regenBtn = e.target.closest('.btn-regenerate');
        if (regenBtn) {
            const isLastAi = currentSession?.messages.length > 0 && currentSession.messages[currentSession.messages.length - 1].role === 'assistant';
            if (isLastAi) {
                currentSession.messages.pop();
                const msgsDOM = document.getElementById('chat-messages');
                msgsDOM.removeChild(msgsDOM.lastElementChild);
                triggerCompletion();
            }
        }
    });
    
    document.getElementById('btn-export-chat')?.addEventListener('click', () => {
        if (!currentSession || currentSession.messages.length === 0) return;
        let text = `# ${currentSession.title}\n\n`;
        currentSession.messages.forEach(m => {
            text += `### ${m.role === 'user' ? 'User' : 'Assistant'}\n${m.content}\n\n---\n\n`;
        });
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${currentSession.title || 'chat'}.md`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });
};

export const createNewChat = () => {
    currentSession = {
        id: Date.now().toString(),
        title: '',
        timestamp: Date.now(),
        messages: [],
        projectId: activeProjectId || null
    };
    renderChatMessages();
    renderSidebarList();
    const input = document.getElementById('chat-input');
    if (input) input.focus();
};

const loadSessionUI = (id) => {
    const session = getSession(id);
    if (session) {
        currentSession = session;
        renderChatMessages();
        renderSidebarList();
        closeSidebarMobile(); // close sidebar on mobile after selecting
    } else {
        createNewChat();
    }
};

/**
 * Shows a tiny inline confirm popup anchored near `anchorEl`.
 * Calls `onConfirm` if the user clicks Yes. Auto-dismisses on outside click.
 */
const showInlineConfirm = (anchorEl, message, onConfirm) => {
    // Remove any existing popup first
    document.getElementById('inline-confirm-popup')?.remove();

    const popup = document.createElement('div');
    popup.id = 'inline-confirm-popup';
    popup.innerHTML = `
        <span class="inline-confirm__msg">${escapeHTML(message)}</span>
        <button class="inline-confirm__yes">Yes</button>
        <button class="inline-confirm__no">No</button>
    `;

    document.body.appendChild(popup);

    // Position near the anchor
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 4 + window.scrollY}px`;
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;

    const cleanup = () => popup.remove();

    popup.querySelector('.inline-confirm__yes').addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup();
        onConfirm();
    });
    popup.querySelector('.inline-confirm__no').addEventListener('click', (e) => {
        e.stopPropagation();
        cleanup();
    });

    // Dismiss on outside click
    const outside = (e) => {
        if (!popup.contains(e.target)) {
            cleanup();
            document.removeEventListener('click', outside, true);
        }
    };
    setTimeout(() => document.addEventListener('click', outside, true), 0);
};

export const renderSidebarList = () => {
    const container = document.getElementById('session-list');
    if (!container) return;

    const allSessions = getSessionList();
    const list = activeProjectId
        ? allSessions.filter(s => s.projectId === activeProjectId)
        : allSessions.filter(s => !s.projectId);

    const label = activeProjectId
        ? (getProject(activeProjectId)?.name || 'Project') + ' Chats'
        : 'Recent Chats';

    container.innerHTML = `<div class="sidebar__sessions-title">${escapeHTML(label)}</div>`;
    
    list.sort((a,b) => b.timestamp - a.timestamp).forEach(session => {
        const div = document.createElement('div');
        div.className = `session-item ${currentSession && currentSession.id === session.id ? 'session-item--active' : ''}`;
        div.innerHTML = `
            <span class="session-item__title">${escapeHTML(session.title || 'New Chat')}</span>
            <div class="session-item__actions">
                <button class="btn-icon btn-delete-session" title="Delete">
                    <svg class="icon"><use href="#icon-trash"></use></svg>
                </button>
            </div>
        `;
        
        div.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-delete-session')) {
                loadSessionUI(session.id);
            }
        });
        
        const delBtn = div.querySelector('.btn-delete-session');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showInlineConfirm(delBtn, 'Delete this chat?', () => {
                deleteSession(session.id);
                if (currentSession && currentSession.id === session.id) {
                    createNewChat();
                } else {
                    renderSidebarList();
                }
            });
        });
        
        container.appendChild(div);
    });
};

const renderChatMessages = () => {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!currentSession || !currentSession.messages.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state__icon">MD</div>
                <h2>How can I help you today?</h2>
                <div class="prompt-grid">
                    <button class="prompt-card" data-prompt="Explain SSE streaming in JavaScript">
                        Explain SSE streaming in JavaScript
                    </button>
                    <button class="prompt-card" data-prompt="Write a React component for a chat UI">
                        Write a React component for a chat UI
                    </button>
                    <button class="prompt-card" data-prompt="What is the difference between latency and throughput?">
                        What is the difference between latency and throughput?
                    </button>
                    <button class="prompt-card" data-prompt="Generate a markdown table of common CSS selectors">
                        Generate a markdown table of common CSS selectors
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    currentSession.messages.forEach(msg => {
        // content can be string or array (multipart with images)
        const textContent = Array.isArray(msg.content)
            ? msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
            : msg.content;
        const imageAttachments = Array.isArray(msg.content)
            ? msg.content.filter(c => c.type === 'image_url').map(c => ({ type: 'image', name: 'image', dataUrl: c.image_url.url }))
            : [];
        container.appendChild(buildMessageDOM(msg.role, textContent, imageAttachments));
    });
    
    scrollToBottom();
};

const scrollToBottom = () => {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
};

let currentAbortController = null;
let currentStopHandler = null;

/**
 * Turns a user message bubble into an inline edit textarea, then resends on confirm.
 */
const startEditUserMessage = (msgDiv) => {
    const bubble = msgDiv.querySelector('.chat__bubble--user');
    const textEl = bubble?.querySelector('.user-msg-text');
    if (!textEl) return;

    const originalText = textEl.innerText;
    const msgIndex = Array.from(document.getElementById('chat-messages').children).indexOf(msgDiv);

    // Replace bubble content with textarea
    bubble.innerHTML = `
        <textarea class="edit-msg-textarea">${escapeHTML(originalText)}</textarea>
        <div class="edit-msg-actions">
            <button class="btn-edit-save">Send</button>
            <button class="btn-edit-cancel">Cancel</button>
        </div>
    `;

    const textarea = bubble.querySelector('.edit-msg-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    bubble.querySelector('.btn-edit-cancel').addEventListener('click', () => {
        // Restore original DOM
        const container = document.getElementById('chat-messages');
        renderChatMessages();
    });

    bubble.querySelector('.btn-edit-save').addEventListener('click', () => {
        const newText = textarea.value.trim();
        if (!newText) return;

        // Trim session messages from this point forward
        const userMsgCount = Array.from(document.getElementById('chat-messages').children)
            .slice(0, msgIndex + 1).filter(el => el.classList.contains('chat__message--user')).length;

        // Find the index in session messages (user messages only)
        let userCount = 0;
        let sessionIdx = -1;
        for (let i = 0; i < currentSession.messages.length; i++) {
            if (currentSession.messages[i].role === 'user') userCount++;
            if (userCount === userMsgCount) { sessionIdx = i; break; }
        }

        if (sessionIdx !== -1) {
            // Remove all messages from sessionIdx onwards and re-add the edited one
            currentSession.messages = currentSession.messages.slice(0, sessionIdx);
        }

        // Push the edited message and save
        currentSession.messages.push({ role: 'user', content: newText });
        currentSession.timestamp = Date.now();
        saveSession(currentSession);

        // Re-render chat and trigger AI
        renderChatMessages();
        triggerCompletion();
    });
};

const handleSend = async () => {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content && pendingAttachments.length === 0) return;

    input.value = '';

    if (currentSession.messages.length === 0) {
        document.getElementById('chat-messages').innerHTML = '';
    }

    const attachmentsSnapshot = [...pendingAttachments];
    pendingAttachments = [];
    renderFilePreviewStrip();

    // Build API content — multipart if attachments, else plain string
    let apiContent;
    if (attachmentsSnapshot.length > 0) {
        apiContent = [];

        attachmentsSnapshot.forEach(att => {
            if (att.type === 'image') {
                // Send image visually — AI can see it
                apiContent.push({ type: 'image_url', image_url: { url: att.dataUrl } });

            } else if (att.type === 'text') {
                // Send actual file content — AI can read and analyze it
                apiContent.push({
                    type: 'text',
                    text: `[File: ${att.name} | ${att.sizeStr} | ${att.ext.toUpperCase()}]\n\`\`\`${att.ext}\n${att.content}\n\`\`\``
                });

            } else {
                // Archive / binary / doc — send metadata only
                apiContent.push({
                    type: 'text',
                    text: `[Attached file: ${att.name} | ${att.sizeStr} | Type: ${att.ext.toUpperCase()} | Note: Binary/archive files cannot be read, only acknowledged]`
                });
            }
        });

        if (content) apiContent.push({ type: 'text', text: content });
    } else {
        apiContent = content;
    }

    currentSession.messages.push({ role: 'user', content: apiContent });
    if (!currentSession.title) {
        currentSession.title = (content || attachmentsSnapshot[0]?.name || 'Chat').substring(0, 30);
    }
    currentSession.timestamp = Date.now();
    saveSession(currentSession);

    const container = document.getElementById('chat-messages');
    container.appendChild(buildMessageDOM('user', content, attachmentsSnapshot));
    scrollToBottom();
    renderSidebarList();

    triggerCompletion();
};

const triggerCompletion = async () => {
    const container = document.getElementById('chat-messages');
    const aiDOM = buildMessageDOM('assistant', '');
    container.appendChild(aiDOM);
    scrollToBottom();

    // Show loading skeleton while waiting for first token
    const contentEl = aiDOM.querySelector('.chat__content');
    contentEl.innerHTML = `<div class="thinking-indicator"><span></span><span></span><span></span></div>`;

    const btnSend = document.getElementById('btn-send');
    const sendIconRaw = btnSend ? btnSend.innerHTML : '';

    currentAbortController = new AbortController();

    if (btnSend) {
        btnSend.innerHTML = '<div style="width:12px;height:12px;background:white;border-radius:2px;"></div>';
        currentStopHandler = () => {
            if (currentAbortController) currentAbortController.abort();
        };
        btnSend.removeEventListener('click', handleSend);
        btnSend.addEventListener('click', currentStopHandler);
    }

    let streamedContent = '';
    let reasoningContent = '';
    let lastUsage = null;
    let hasStartedContent = false;
    let rafPending = false;

    // Dedicated elements for live update — no full re-render
    const reasoningEl = document.createElement('details');
    reasoningEl.className = 'thinking-block';
    reasoningEl.style.display = 'none';
    reasoningEl.innerHTML = `<summary class="thinking-block__label">
        <svg class="icon icon--sm" style="display:inline;vertical-align:middle;margin-right:4px;"><use href="#icon-refresh"></use></svg>
        Thinking…
    </summary><div class="thinking-block__content"></div>`;
    const reasoningTextEl = reasoningEl.querySelector('.thinking-block__content');

    const liveTextEl = document.createElement('div');
    liveTextEl.className = 'live-stream-text';

    const cursorEl = document.createElement('span');
    cursorEl.className = 'cursor-blink';

    contentEl.innerHTML = '';
    contentEl.appendChild(reasoningEl);
    contentEl.appendChild(liveTextEl);
    contentEl.appendChild(cursorEl);

    // Throttled DOM flush via requestAnimationFrame — max 1 update per frame (~60fps)
    const flushDOM = () => {
        rafPending = false;

        if (reasoningContent) {
            reasoningEl.style.display = '';
            reasoningEl.open = !hasStartedContent;
            reasoningTextEl.textContent = reasoningContent; // textContent = no HTML parsing cost
        }

        if (hasStartedContent) {
            // Plain text during stream — no markdown parsing cost
            liveTextEl.textContent = streamedContent;
            cursorEl.style.display = '';
        } else if (!reasoningContent) {
            liveTextEl.innerHTML = '<div class="thinking-indicator"><span></span><span></span><span></span></div>';
        }

        // Smart scroll — only scroll if user is near bottom (within 100px)
        const container = document.getElementById('chat-messages');
        if (container) {
            const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distFromBottom < 100) container.scrollTop = container.scrollHeight;
        }
    };

    /** Schedules one DOM flush per animation frame — called on every token */
    const scheduleFlush = () => {
        if (!rafPending) {
            rafPending = true;
            requestAnimationFrame(flushDOM);
        }
    };

    try {
        const settings = getSettings();
        const payload = {
            model: getSelectedModelId(),
            messages: [...currentSession.messages],
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            top_p: settings.topP,
            stream: true
        };

        // Only request extended thinking when user has it enabled
        if (settings.thinkingEnabled) {
            payload.thinking = { type: 'enabled', budget_tokens: 5000 };
        }

        if (settings.systemPrompt || currentSession.projectId) {
            const projectPrompt = currentSession.projectId
                ? (getProject(currentSession.projectId)?.systemPrompt || '')
                : '';
            const combined = [projectPrompt, settings.systemPrompt].filter(Boolean).join('\n\n');
            if (combined) payload.messages.unshift({ role: 'system', content: combined });
        }

        const response = await sendChatCompletion(payload, (chunk, usage, reasoningChunk, type) => {
            if (type === 'reasoning') {
                reasoningContent += reasoningChunk;
            } else {
                streamedContent = chunk;
                hasStartedContent = true;
            }
            if (usage) lastUsage = usage;
            scheduleFlush(); // throttled — not every token
        }, currentAbortController.signal);

        if (response) streamedContent = response;

        currentSession.messages.push({ role: 'assistant', content: streamedContent });
        currentSession.timestamp = Date.now();
        saveSession(currentSession);

        // ── Final render: NOW run markdown once ──────────────────────────
        cursorEl.remove();
        liveTextEl.remove();
        reasoningEl.remove();

        let finalHtml = '';
        if (reasoningContent) {
            finalHtml += `<details class="thinking-block">
                <summary class="thinking-block__label">
                    <svg class="icon icon--sm" style="display:inline;vertical-align:middle;margin-right:4px;"><use href="#icon-refresh"></use></svg>
                    Thought for a moment
                </summary>
                <div class="thinking-block__content">${escapeHTML(reasoningContent).replace(/\n/g, '<br/>')}</div>
            </details>`;
        }
        finalHtml += renderMarkdown(streamedContent); // ← only called ONCE
        contentEl.innerHTML = finalHtml;

        if (lastUsage) {
            aiDOM.querySelector('.chat__message-meta').textContent = `${lastUsage.total_tokens || '?'} tokens`;
        }

    } catch (e) {
        cursorEl.remove();
        liveTextEl.remove();
        reasoningEl.remove();
        if (e.name === 'AbortError') {
            contentEl.innerHTML = renderMarkdown(streamedContent) + ' <span style="color:var(--text-dim);font-size:0.75rem;">[Stopped]</span>';
            if (streamedContent) {
                currentSession.messages.push({ role: 'assistant', content: streamedContent + ' [Stopped]' });
                saveSession(currentSession);
            }
        } else {
            contentEl.innerHTML = `<p style="color:var(--bg-danger)">Error: ${escapeHTML(e.message)}</p>`;
        }
    } finally {
        currentAbortController = null;
        if (btnSend) {
            btnSend.removeEventListener('click', currentStopHandler);
            btnSend.addEventListener('click', handleSend);
            btnSend.innerHTML = sendIconRaw;
            btnSend.disabled = false;
        }

        const newMsgDom = buildMessageDOM('assistant', streamedContent);
        const metaText = aiDOM.querySelector('.chat__message-meta').textContent;
        aiDOM.innerHTML = newMsgDom.innerHTML;
        // Restore thinking block into final DOM
        if (reasoningContent) {
            const thinkingBlock = document.createElement('details');
            thinkingBlock.className = 'thinking-block';
            thinkingBlock.innerHTML = `<summary class="thinking-block__label">
                    <svg class="icon icon--sm" style="display:inline;vertical-align:middle;margin-right:4px;"><use href="#icon-refresh"></use></svg>
                    Thought for a moment
                </summary>
                <div class="thinking-block__content">${escapeHTML(reasoningContent).replace(/\n/g, '<br/>')}</div>`;
            aiDOM.querySelector('.chat__content').prepend(thinkingBlock);
        }
        if (metaText) {
            aiDOM.querySelector('.chat__message-meta').textContent = metaText;
        }

        scrollToBottom();
    }
};
