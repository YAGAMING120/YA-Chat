import { useEffect, useMemo, useRef } from 'react';
import type { Attachment } from '../../types/attachment';
import {
  addAttachments,
  removeAttachment,
  setDraft,
  useComposerState
} from '../../stores/composerStore';
import {
  closeComposerTools,
  closeTools,
  openSettings,
  openTts,
  showToast,
  toggleComposerTools,
  toggleTools,
  useUiState
} from '../../stores/uiStore';
import { setThinkingEnabled, useSettingsState } from '../../stores/settingsStore';
import { useStreamState } from '../../stores/streamStore';
import { useToolsState } from '../../stores/toolsStore';
import { sendMessage, stopStreaming } from '../../stores/sendActions';
import { setCanvasWanted, useCanvasState } from '../../stores/canvasStore';
import { readFileAsAttachment } from '../../lib/files';
import { TOOL_DEFS } from '../../lib/tools';
import { pdfIconUrl } from '../../lib/assets';
import { ToolsPopover } from './ToolsPopover';

const ATTACH_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const TOOLS_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const THINK_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a5 5 0 0 1 4.5 2.8A4 4 0 0 1 20 8a4 4 0 0 1-1.5 3.1A5 5 0 0 1 17 15a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1-1.5-3.9A4 4 0 0 1 4 8a4 4 0 0 1 3.5-3.2A5 5 0 0 1 12 2z" />
    <path d="M12 2v20" />
    <path d="M8 6c2 1 4 1 4 1" />
    <path d="M16 6c-2 1-4 1-4 1" />
    <path d="M8 12c2 1 4 1 4 1" />
    <path d="M16 12c-2 1-4 1-4 1" />
  </svg>
);

const SYSTEM_PROMPT_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const CANVAS_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

const SPEAK_ICON = (
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
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const PLUS_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SEND_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

function FilePreviewStrip({ attachments }: { attachments: Attachment[] }): JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div id="file-preview-strip" className="file-preview-strip">
      {attachments.map((att, idx) => (
        <div key={`${att.name}-${idx}`} className={`file-chip file-chip--${att.category}`}>
          {att.type === 'image' ? (
            <img src={att.dataUrl} className="file-chip__thumb" alt={att.name} />
          ) : att.type === 'pdf' ? (
            <span className="file-chip__icon">
              <img src={pdfIconUrl} alt="PDF" style={{ width: 20, height: 20, verticalAlign: 'middle' }} />
            </span>
          ) : (
            <span className="file-chip__icon">{att.icon}</span>
          )}
          <div className="file-chip__info">
            <span className="file-chip__name">{att.name}</span>
            <span className="file-chip__size">{att.sizeStr}</span>
          </div>
          <button type="button" className="file-chip__remove" onClick={() => removeAttachment(idx)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/** The composer: draft textarea, attachment strip, tool toggles, send/stop. */
export function Composer(): JSX.Element {
  const { draft, attachments } = useComposerState();
  const { composerFocusTick, toolsOpen, composerTools } = useUiState();
  const { settings } = useSettingsState();
  const { active: streaming } = useStreamState();
  const { enabled } = useToolsState();
  const { wanted: canvasWanted } = useCanvasState();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The vertical tools menu closes on outside clicks (the "+" button and the
  // menu itself are exempt).
  useEffect(() => {
    if (!composerTools) return;
    const onDocClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('#tools-menu, #btn-add-tools')) return;
      closeComposerTools();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [composerTools]);

  const enabledToolDefs = useMemo(
    () => TOOL_DEFS.filter((t) => enabled[t.id]),
    [enabled]
  );
  const toolCount = enabledToolDefs.length;
  const toolsTitle = toolCount
    ? `Tools: ${enabledToolDefs.map((t) => t.label).join(', ')}`
    : 'Tools — web search, date & time, read URL, images';

  // Ctrl+/ and "new chat" focus the composer via focusComposer()
  useEffect(() => {
    textareaRef.current?.focus();
  }, [composerFocusTick]);

  const handleSend = (): void => {
    if (streaming) return;
    void sendMessage(draft, attachments);
  };

  const handleFiles = async (files: File[]): Promise<void> => {
    const read: Attachment[] = [];
    for (const file of files) {
      try {
        read.push(await readFileAsAttachment(file));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to read file', 'error');
      }
    }
    if (read.length > 0) addAttachments(read);
  };

  return (
    <div className="input-container">
      <div className="input-wrapper">
        <FilePreviewStrip attachments={attachments} />
        <textarea
          id="chat-input"
          ref={textareaRef}
          className="chat-input"
          placeholder="Ask Blaze Chat anything..."
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="input-tools">
          <button
            type="button"
            id="btn-add-tools"
            className={`btn-tool btn-tool--plus${composerTools ? ' btn-tool--active' : ''}`}
            title={composerTools ? 'Hide tools' : 'Show tools'}
            aria-expanded={composerTools}
            onClick={() => {
              if (!composerTools && toolsOpen) closeTools();
              toggleComposerTools();
            }}
          >
            {PLUS_ICON}
            {!composerTools && (toolCount > 0 || settings.thinkingEnabled || canvasWanted) && (
              <span className="btn-tool__dot" />
            )}
          </button>
          {composerTools && (
            <div className="tools-menu" id="tools-menu" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                id="btn-attach-file"
                className="btn-tool"
                title="Attach Image or PDF"
                onClick={() => fileInputRef.current?.click()}
              >
                {ATTACH_ICON}
                <span className="btn-tool__label">Attach</span>
              </button>
              <input
                ref={fileInputRef}
                id="file-input"
                type="file"
                accept="*/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) void handleFiles(files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                id="btn-tools"
                className={`btn-tool${toolCount > 0 ? ' btn-tool--active btn-tool--has-tools' : ''}`}
                title={toolsTitle}
                onClick={(e) => {
                  e.stopPropagation();
                  closeComposerTools();
                  toggleTools();
                }}
              >
                {TOOLS_ICON}
                <span className="btn-tool__label">Tools</span>
                <span className="btn-tool__count" style={{ display: toolCount ? '' : 'none' }}>
                  {toolCount ? String(toolCount) : ''}
                </span>
              </button>
              <button
                type="button"
                id="btn-thinking-toggle"
                className={`btn-tool${settings.thinkingEnabled ? ' btn-tool--active' : ''}`}
                title={settings.thinkingEnabled ? 'Thinking ON — click to disable' : 'Thinking OFF — click to enable'}
                onClick={() => setThinkingEnabled(!settings.thinkingEnabled)}
              >
                {THINK_ICON}
                <span className="btn-tool__label">Think</span>
              </button>
              <button
                type="button"
                id="btn-system-prompt"
                className="btn-tool"
                title="System Prompt"
                onClick={() => {
                  closeComposerTools();
                  openSettings();
                }}
              >
                {SYSTEM_PROMPT_ICON}
                <span className="btn-tool__label">System</span>
              </button>
              <button
                type="button"
                id="btn-canvas-toggle"
                className={`btn-tool${canvasWanted ? ' btn-tool--active' : ''}`}
                title="Canvas - get a reply in an editable document"
                onClick={() => setCanvasWanted(!canvasWanted)}
              >
                {CANVAS_ICON}
                <span className="btn-tool__label">Canvas</span>
              </button>
              <button
                type="button"
                id="btn-tts"
                className="btn-tool"
                title="Text to speech — turn text into an MP3 voice"
                onClick={() => {
                  closeComposerTools();
                  openTts(draft);
                }}
              >
                {SPEAK_ICON}
                <span className="btn-tool__label">Speak</span>
              </button>
              <div className="divider-horizontal" />
              <span className="shortcut-hint">Shift+Enter for newline</span>
            </div>
          )}
        </div>
        <button
          type="button"
          id="btn-send"
          className="btn-send"
          title={streaming ? 'Stop generating' : 'Send'}
          onClick={streaming ? stopStreaming : handleSend}
        >
          {streaming ? (
            <div style={{ width: 12, height: 12, background: 'white', borderRadius: 2 }} />
          ) : (
            SEND_ICON
          )}
        </button>
        {toolsOpen && <ToolsPopover />}
      </div>
      <div className="app-footer">Blaze Chat • Powered by OpenRouter • v2.0.0</div>
    </div>
  );
}
