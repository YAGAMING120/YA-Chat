/**
 * Chat logic (send, receive, history, sessions)
 */
import { getSessionList, getSession, saveSession, deleteSession } from './storage.js';
import { getSettings } from './settings.js';
import { getSelectedModelId } from './models.js';
import { sendChatCompletion } from './api.js';
import { buildMessageDOM, escapeHTML, renderMarkdown } from './renderer.js';
import { closeSidebarMobile } from './ui.js';

let currentSession = null;

export const initChat = () => {
    console.log('Chat initialized');
    
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

    const list = getSessionList();
    if (list.length > 0) {
        loadSessionUI(list[0].id);
    } else {
        createNewChat();
    }
    
    renderSidebarList();
    
    // Global Event delegation for copy actions and prompts
    document.addEventListener('click', (e) => {
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
                const originalHtml = copyMsgBtn.innerHTML;
                copyMsgBtn.innerHTML = 'Copied!';
                setTimeout(() => copyMsgBtn.innerHTML = originalHtml, 2000);
            }
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
            const isLastAi = currentSession && currentSession.messages.length > 0 && currentSession.messages[currentSession.messages.length - 1].role === 'assistant';
            if (isLastAi) {
                currentSession.messages.pop(); // Remove AI
                const msgsDOM = document.getElementById('chat-messages');
                msgsDOM.removeChild(msgsDOM.lastElementChild);
                
                // Resend based on last user request
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
        a.href = url;
        a.download = `${currentSession.title || 'chat'}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
};

export const createNewChat = () => {
    currentSession = {
        id: Date.now().toString(),
        title: '',
        timestamp: Date.now(),
        messages: []
    };
    renderChatMessages();
    renderSidebarList();
    
    const input = document.getElementById('chat-input');
    if(input) input.focus();
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
    
    const list = getSessionList();
    
    container.innerHTML = '<div class="sidebar__sessions-title">Recent Sessions</div>';
    
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
        container.appendChild(buildMessageDOM(msg.role, msg.content));
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

const handleSend = async () => {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content) return;
    
    input.value = '';
    
    if (currentSession.messages.length === 0) {
        document.getElementById('chat-messages').innerHTML = ''; // clear empty state
    }
    
    currentSession.messages.push({ role: 'user', content });
    if (!currentSession.title) {
        currentSession.title = content.substring(0, 30);
    }
    currentSession.timestamp = Date.now();
    saveSession(currentSession);
    
    const container = document.getElementById('chat-messages');
    container.appendChild(buildMessageDOM('user', content));
    scrollToBottom();
    renderSidebarList(); // re-render to update title
    
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

    /** Renders the thinking block + streamed content into the bubble */
    const renderBubble = () => {
        let html = '';
        if (reasoningContent) {
            html += `<details class="thinking-block" ${hasStartedContent ? '' : 'open'}>
                <summary class="thinking-block__label">
                    <svg class="icon icon--sm" style="display:inline;vertical-align:middle;margin-right:4px;"><use href="#icon-refresh"></use></svg>
                    Thinking…
                </summary>
                <div class="thinking-block__content">${escapeHTML(reasoningContent).replace(/\n/g, '<br/>')}</div>
            </details>`;
        }
        if (streamedContent) {
            html += renderMarkdown(streamedContent);
        } else if (!reasoningContent) {
            html += `<div class="thinking-indicator"><span></span><span></span><span></span></div>`;
        }
        contentEl.innerHTML = html + (hasStartedContent && streamedContent ? '<span class="cursor-blink"></span>' : '');
        scrollToBottom();
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

        if (settings.systemPrompt) {
            payload.messages.unshift({ role: 'system', content: settings.systemPrompt });
        }

        const response = await sendChatCompletion(payload, (chunk, usage, reasoningChunk, type) => {
            if (type === 'reasoning') {
                reasoningContent += reasoningChunk;
            } else {
                streamedContent = chunk;
                hasStartedContent = true;
            }
            if (usage) lastUsage = usage;
            renderBubble();
        }, currentAbortController.signal);

        if (response) streamedContent = response;

        currentSession.messages.push({ role: 'assistant', content: streamedContent });
        currentSession.timestamp = Date.now();
        saveSession(currentSession);

        // Final render — collapse thinking block, remove cursor
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
        finalHtml += renderMarkdown(streamedContent);
        contentEl.innerHTML = finalHtml;

        if (lastUsage) {
            aiDOM.querySelector('.chat__message-meta').textContent = `${lastUsage.total_tokens || '?'} tokens`;
        }

    } catch (e) {
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
