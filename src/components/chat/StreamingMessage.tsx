import { useState } from 'react';
import { useStreamState } from '../../stores/streamStore';
import { stripCanvasForStream } from '../../lib/markdown/canvasBlocks';
import { logoUrl } from '../../lib/assets';

const THINKING_ICON = (
  <svg
    className="icon icon--sm"
    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
  >
    <use href="#icon-refresh" />
  </svg>
);

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

interface StreamingMessageProps {
  onListen?: (text: string) => void;
  onRegenerate?: () => void;
}

const LISTEN_ICON = (
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
);

/**
 * The in-flight assistant bubble: thinking indicator → live reasoning →
 * plain-text stream with a blinking cursor, or an error after a failure.
 * Markdown runs only once, on the final message.
 */
export function StreamingMessage({
  onListen,
  onRegenerate
}: StreamingMessageProps): JSX.Element | null {
  const s = useStreamState();
  const [copied, setCopied] = useState(false);

  if (!s.active && !s.error) return null;

  const partial = stripCanvasForStream(s.content);

  return (
    <div className="chat__message--ai">
      <div className="chat__avatar--ai">
        <img src={logoUrl} alt="YA Chat" className="ai-avatar-img" />
      </div>
      <div className="chat__bubble--ai">
        <div className="chat__content">
          {s.reasoning ? (
            <details className="thinking-block" open={!s.started}>
              <summary className="thinking-block__label">
                {THINKING_ICON}
                Thinking…
              </summary>
              <div className="thinking-block__content">{s.reasoning}</div>
            </details>
          ) : null}
          {s.toolLabel ? (
            <div className="tool-activity">
              <span className="tool-activity__dot" />
              {s.toolLabel}
            </div>
          ) : null}
          {s.error ? (
            <p style={{ color: 'var(--bg-danger)' }}>Error: {s.error}</p>
          ) : s.started ? (
            <div className="live-stream-text">{partial}</div>
          ) : !s.reasoning ? (
            <div className="thinking-indicator">
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {s.started && !s.error ? <span className="cursor-blink" /> : null}
        </div>
        <div className="chat__message-actions">
          <button
            type="button"
            className="btn-action btn-copy-msg"
            onClick={() => {
              void navigator.clipboard.writeText(partial);
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
            onClick={() => onListen?.(partial)}
          >
            {LISTEN_ICON}
            Listen
          </button>
          <button type="button" className="btn-action btn-regenerate" onClick={onRegenerate}>
            <svg className="icon">
              <use href="#icon-refresh" />
            </svg>
            Regenerate
          </button>
          <div className="chat__message-meta" />
        </div>
      </div>
    </div>
  );
}
