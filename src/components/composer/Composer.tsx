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
    viewBox="11 6 78 88"
    style={{ fill: 'currentColor', stroke: 'currentColor', strokeWidth: 5 }}
  >
    <path d="m42.77 59.629c0 0.69141-0.55859 1.25-1.25 1.25-5.2617 0-9.5859 4.0547-10.02 9.1953 4.5977 1.8633 7.8516 6.3633 7.8516 11.609 0 0.69141-0.55859 1.25-1.25 1.25-0.69141 0-1.25-0.55859-1.25-1.25 0-5.5273-4.5117-10.027-10.059-10.027-0.69141 0-1.25-0.55859-1.25-1.25s0.55859-1.25 1.25-1.25c0.77344 0 1.5312 0.074219 2.2695 0.21094 0.76953-6.1836 6.0625-10.988 12.461-10.988 0.69141 0 1.25 0.55859 1.25 1.25zm-0.03125-16.66c-4.7969 2.7734-10.961 1.1211-13.742-3.6797-0.34766-0.59766-1.1094-0.80078-1.707-0.45312-0.59766 0.34766-0.80078 1.1094-0.45312 1.707 2.2773 3.9297 6.3711 6.1641 10.609 6.2656-0.86328 1.8477-2.2656 3.3828-4.0703 4.4219-2.3242 1.3398-5.0352 1.6953-7.6328 1.0078-0.66797-0.17969-1.3516 0.21875-1.5312 0.88672-0.17969 0.66797 0.21875 1.3516 0.88672 1.5312 1.0781 0.28906 2.1758 0.42969 3.2617 0.42969 2.1758 0 4.3242-0.57031 6.2617-1.6836 2.668-1.5391 4.6367-3.9453 5.6094-6.8359 1.2891-0.26172 2.5586-0.73438 3.7617-1.4297 0.59766-0.34375 0.80078-1.1094 0.45703-1.707-0.34766-0.59766-1.1094-0.80078-1.707-0.45703zm41.219 12.121c1.0547 1.8711 1.6094 3.9688 1.6094 6.125 0 3.9648-1.8594 7.6523-5.0078 10.016 0.050781 0.46484 0.074218 0.93359 0.074218 1.4102 0 5.6133-3.6953 10.504-9.0508 12.051-2.3555 3.3359-6.1562 5.3125-10.273 5.3125-4.9688 0-9.2734-2.8984-11.309-7.0938-2.0352 4.1953-6.3398 7.0938-11.309 7.0938-4.1133 0-7.918-1.9766-10.273-5.3125-5.3516-1.5469-9.0508-6.4336-9.0508-12.051 0-0.47656 0.023437-0.94531 0.074218-1.4102-3.1406-2.3555-4.9883-6.043-4.9883-10.016 0-2.168 0.54688-4.2695 1.5938-6.125-1.2852-2.0156-1.9609-4.3281-1.9609-6.7383 0-2.6016 0.81641-5.1562 2.3164-7.2617-0.32422-1.0898-0.48828-2.2227-0.48828-3.3672 0-5.4961 3.7617-10.152 8.9688-11.406-0.1875-0.73047-0.28516-1.4766-0.28516-2.2305 0-3.7539 2.3203-6.9727 5.6055-8.3047 2.8984-2.3555 6.2695-4.1562 9.5195-5.082 3.3281-0.94531 6.3125-0.92188 8.4062 0.0625 0.75391 0.35547 1.3828 0.82812 1.8711 1.4023 0.48828-0.57422 1.1172-1.0469 1.8711-1.4023 2.0938-0.98438 5.0781-1.0078 8.4062-0.0625 3.25 0.92578 6.6211 2.7266 9.5195 5.082 3.2812 1.3359 5.6055 4.5547 5.6055 8.3047 0 0.75781-0.09375 1.5039-0.28516 2.2305 5.2109 1.25 8.9688 5.9102 8.9688 11.406 0 1.1484-0.16406 2.2773-0.48828 3.3672 1.4961 2.1055 2.3164 4.6602 2.3164 7.2617 0 2.4102-0.67578 4.7266-1.9609 6.7383zm-35.207 22.363v-41.059c-0.24609-0.79688-0.76953-1.457-1.4922-1.875-0.76172-0.44141-1.6562-0.55469-2.5117-0.32031-0.66406 0.18359-1.3516-0.21094-1.5352-0.87891-0.17969-0.66406 0.21094-1.3516 0.87891-1.5352 1.5039-0.41016 3.0703-0.20703 4.4141 0.56641 0.082032 0.046876 0.16406 0.097657 0.24219 0.14844l0.003906-16.707c0-1.3359-0.55078-2.2422-1.6875-2.7773-2.3867-1.1211-7.0312-0.46094-11.762 2.2656 2.6055 0.50781 4.8711 2.1406 6.1523 4.5117 0.32812 0.60938 0.10156 1.3672-0.50781 1.6953-0.60937 0.32812-1.3672 0.10156-1.6953-0.50781-1.1211-2.0781-3.2969-3.3672-5.6836-3.3672-0.76953 0-1.5039 0.13672-2.1875 0.38281-0.074218 0.039062-0.15625 0.070312-0.23438 0.089844-2.3711 0.96094-4.0508 3.2852-4.0508 5.9922 0 0.64844 0.10156 1.2891 0.29297 1.9141 0.089843-0.003907 0.17969-0.007813 0.26562-0.007813 6.4766 0 11.746 5.2617 11.746 11.734 0 0.69141-0.55859 1.25-1.25 1.25-0.69141 0-1.25-0.55859-1.25-1.25 0-5.0898-4.1484-9.2344-9.2461-9.2344-0.32422 0-0.65625 0.015625-0.98047 0.050781-4.7109 0.49609-8.2656 4.4453-8.2656 9.1836 0 1.0898 0.1875 2.1562 0.55469 3.1758 0.14844 0.41016 0.070312 0.86328-0.19922 1.2031-1.4102 1.7617-2.1836 3.9844-2.1836 6.25 0 2.1602 0.67578 4.2188 1.9531 5.957 1.8164 2.4453 4.5742 3.9297 7.5742 4.0703 0.69141 0.03125 1.2227 0.61719 1.1875 1.3086-0.03125 0.66797-0.58594 1.1914-1.2461 1.1914h-0.058594c-3.1172-0.14844-6.0273-1.4531-8.2227-3.6445-0.53906 1.2422-0.81641 2.5938-0.81641 3.9805 0 3.3945 1.6875 6.5312 4.5156 8.3867 0.41406 0.27344 0.63281 0.76562 0.54688 1.2578-0.097657 0.57422-0.14844 1.1719-0.14844 1.7812 0 4.6289 3.1367 8.6367 7.625 9.75 0.30859 0.074219 0.57422 0.26562 0.74609 0.53125 1.8633 2.8672 5.0234 4.5781 8.4492 4.5781 5.5469 0 10.059-4.5078 10.059-10.047zm34.316-16.238c0-1.3789-0.28516-2.7266-0.83203-3.9805-2.1836 2.1875-5.0938 3.4922-8.2266 3.6406h-0.058593c-0.66406 0-1.2148-0.51953-1.2461-1.1914-0.03125-0.69141 0.5-1.2734 1.1875-1.3086 3.0156-0.14453 5.7734-1.625 7.5703-4.0703 1.2773-1.7383 1.957-3.7969 1.957-5.957 0-2.2695-0.77734-4.4883-2.1836-6.25-0.26953-0.33984-0.34766-0.79688-0.19922-1.2031 0.36719-1.0195 0.55469-2.0859 0.55469-3.1758 0-4.7422-3.5547-8.6875-8.2656-9.1836-0.32422-0.03125-0.65625-0.050781-0.98047-0.050781-5.0977 0-9.2461 4.1406-9.2461 9.2344 0 0.69141-0.55859 1.25-1.25 1.25s-1.25-0.55859-1.25-1.25c0-6.4688 5.2695-11.734 11.746-11.734 0.089844 0 0.17969 0.003906 0.26562 0.007813 0.19531-0.62109 0.29297-1.2656 0.29297-1.9141 0-3.5625-2.9023-6.4648-6.4727-6.4648-2.3672 0-4.5469 1.293-5.6836 3.3711-0.33203 0.60547-1.0898 0.82812-1.6953 0.49609s-0.82812-1.0898-0.49609-1.6953c1.2969-2.3672 3.5625-3.9961 6.1523-4.5039-4.7305-2.7305-9.3789-3.3906-11.766-2.2695-1.1367 0.53516-1.6875 1.4414-1.6875 2.7773v10.953c0.078125-0.050782 0.16016-0.10156 0.23828-0.14844 1.3477-0.78125 2.9141-0.98828 4.4141-0.58984 0.66797 0.17969 1.0625 0.86328 0.88672 1.5312-0.17969 0.66797-0.86328 1.0625-1.5312 0.88672-0.85547-0.22656-1.7461-0.10938-2.5156 0.33594-0.72656 0.42188-1.25 1.082-1.4922 1.875v39.312c1.3086-1.75 3.082-3.1641 5.1953-4.0547 0.63672-0.26953 1.3672 0.03125 1.6367 0.66406 0.26953 0.63672-0.027344 1.3672-0.66406 1.6367-3.7461 1.582-6.1641 5.2148-6.1641 9.2578 0 5.5391 4.5117 10.047 10.059 10.047 3.4297 0 6.5859-1.7109 8.4492-4.5781 0.17188-0.26562 0.44141-0.45703 0.74609-0.53125 4.4883-1.1133 7.625-5.1211 7.625-9.75 0-0.60938-0.050781-1.2109-0.14844-1.7812-0.085937-0.48828 0.12891-0.98438 0.54688-1.2578 2.8398-1.8633 4.5352-4.9961 4.5352-8.3867zm-9.8555 7.9414c-0.77344 0-1.5312 0.074219-2.2695 0.21094-0.76953-6.1836-6.0547-10.988-12.441-10.988-0.69141 0-1.25 0.55859-1.25 1.25s0.55859 1.25 1.25 1.25c5.25 0 9.5703 4.0547 10.004 9.1953-4.5977 1.8633-7.8516 6.3633-7.8516 11.609 0 0.69141 0.55859 1.25 1.25 1.25s1.25-0.55859 1.25-1.25c0-5.5273 4.5117-10.027 10.059-10.027 0.69141 0 1.25-0.55859 1.25-1.25s-0.55859-1.25-1.25-1.25zm-1.5234-14.082c1.0664 0 2.1523-0.13672 3.2305-0.42188 0.66797-0.17578 1.0625-0.86328 0.88672-1.5273-0.17578-0.66797-0.86328-1.0664-1.5273-0.88672-4.7734 1.2695-9.6797-1.1211-11.715-5.4336 4.2383-0.10156 8.3281-2.3359 10.602-6.2578 0.34766-0.59766 0.14453-1.3633-0.45312-1.707-0.59766-0.34766-1.3633-0.14062-1.707 0.45312-2.7773 4.793-8.9414 6.4414-13.742 3.6797-0.59766-0.34375-1.3633-0.14062-1.707 0.46094-0.34375 0.59766-0.14063 1.3633 0.46094 1.707 1.1992 0.69141 2.4688 1.1602 3.7578 1.4219 1.7539 5.1562 6.6289 8.5195 11.918 8.5195z" />
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
