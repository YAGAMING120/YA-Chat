import { useState } from 'react';
import type { ChatMessage, Source } from '../../types/chat';
import { messageImages, messageText } from '../../types/chat';
import { normalizeSources } from '../../lib/markdown/sources';
import { escapeHTML } from '../../lib/escape';
import { logoUrl, pdfIconUrl } from '../../lib/assets';
import { Markdown } from './Markdown';

interface MessageBubbleProps {
  message: ChatMessage;
  /** Index in the session's message array (used for edit-and-resend). */
  index: number;
  onEditResend?: (index: number, newText: string) => void;
  onRegenerate?: () => void;
  onListen?: (text: string) => void;
  onOpenArtifact?: (code: string, lang: string) => void;
  onOpenCanvasChip?: (payload: unknown) => void;
}

function Sources({ sources }: { sources: Source[] }): JSX.Element | null {
  if (!sources.length) return null;
  return (
    <div className="msg-sources">
      <div className="msg-sources__label">
        <svg
          className="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
        </svg>
        {sources.length === 1 ? 'Source' : `Sources · ${sources.length}`}
      </div>
      <div className="msg-sources__list">
        {sources.map((s, i) => (
          <a
            key={s.url}
            className="msg-source"
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.url}
          >
            <span className="msg-source__num">{i + 1}</span>
            <span className="msg-source__body">
              <span className="msg-source__title">{s.title}</span>
              <span className="msg-source__host">{s.host}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

export function MessageBubble({
  message,
  index,
  onEditResend,
  onRegenerate,
  onListen,
  onOpenArtifact,
  onOpenCanvasChip
}: MessageBubbleProps): JSX.Element {
  return message.role === 'user' ? (
    <UserBubble message={message} index={index} onEditResend={onEditResend} />
  ) : (
    <AssistantBubble
      message={message}
      onRegenerate={onRegenerate}
      onListen={onListen}
      onOpenArtifact={onOpenArtifact}
      onOpenCanvasChip={onOpenCanvasChip}
    />
  );
}

function AssistantBubble({
  message,
  onRegenerate,
  onListen,
  onOpenArtifact,
  onOpenCanvasChip
}: Omit<MessageBubbleProps, 'index' | 'onEditResend'>): JSX.Element {
  const text = messageText(message.content);
  const sources = normalizeSources(message.annotations);
  const [copied, setCopied] = useState(false);

  return (
    <div className="chat__message--ai">
      <div className="chat__avatar--ai">
        <img src={logoUrl} alt="YA Chat" className="ai-avatar-img" />
      </div>
      <div className="chat__bubble--ai">
        <div className="chat__content">
          {message.reasoning ? (
            <details className="thinking-block">
              <summary className="thinking-block__label">
                <svg
                  className="icon icon--sm"
                  style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                >
                  <use href="#icon-refresh" />
                </svg>
                Thought for a moment
              </summary>
              <div className="thinking-block__content">{message.reasoning}</div>
            </details>
          ) : null}
          <Markdown
            content={text}
            className=""
            onOpenArtifact={onOpenArtifact}
            onOpenCanvasChip={onOpenCanvasChip}
          />
        </div>
        <Sources sources={sources} />
        <div className="chat__message-actions">
          <button
            type="button"
            className="btn-action btn-copy-msg"
            onClick={() => {
              void navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {COPY_ICON}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            className="btn-action btn-listen-msg"
            title="Listen to this reply (text to speech)"
            onClick={() => onListen?.(text)}
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            Listen
          </button>
          <button type="button" className="btn-action btn-regenerate" onClick={onRegenerate}>
            <svg className="icon">
              <use href="#icon-refresh" />
            </svg>
            Regenerate
          </button>
          <div className="chat__message-meta">{message.meta}</div>
        </div>
      </div>
    </div>
  );
}

function UserBubble({
  message,
  index,
  onEditResend
}: {
  message: ChatMessage;
  index: number;
  onEditResend?: (index: number, newText: string) => void;
}): JSX.Element {
  const text = messageText(message.content);
  const attachments = messageImages(message.content);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);

  const startEdit = (): void => {
    setDraft(text);
    setEditing(true);
  };

  const saveEdit = (): void => {
    const next = draft.trim();
    if (!next) return;
    setEditing(false);
    onEditResend?.(index, next);
  };

  return (
    <div className="chat__message--user">
      <div className="chat__bubble--user">
        {editing ? (
          <>
            <textarea
              className="edit-msg-textarea"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="edit-msg-actions">
              <button type="button" className="btn-edit-save" onClick={saveEdit}>
                Send
              </button>
              <button type="button" className="btn-edit-cancel" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {attachments.length > 0 && (
              <div className="msg-attachments">
                {attachments.map((att, i) =>
                  att.type === 'image' ? (
                    <img
                      key={i}
                      className="msg-attachment-img"
                      src={att.dataUrl}
                      alt={att.name}
                      title={att.name}
                    />
                  ) : (
                    <div key={i} className="msg-attachment-file msg-attachment-file--pdf">
                      <span className="msg-attachment-icon">
                        <img src={pdfIconUrl} alt="PDF" style={{ width: 24, height: 24 }} />
                      </span>
                      <div className="msg-attachment-meta">
                        <span className="msg-attachment-name">{att.name || 'PDF Document'}</span>
                        <span className="msg-attachment-size">PDF Document</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            <div
              className="user-msg-text"
              dangerouslySetInnerHTML={{ __html: escapeHTML(text).replace(/\n/g, '<br/>') }}
            />
            <div className="user-msg-actions">
              <button
                type="button"
                className="btn-user-action btn-copy-user-msg"
                title="Copy message"
                style={copied ? { color: 'var(--text-primary)' } : undefined}
                onClick={() => {
                  void navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {COPY_ICON}
              </button>
              <button
                type="button"
                className="btn-user-action btn-edit-user-msg"
                title="Edit & resend"
                onClick={startEdit}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  width="16"
                  height="16"
                >
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
