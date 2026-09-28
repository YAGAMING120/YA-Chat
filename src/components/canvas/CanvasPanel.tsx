import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { escapeHTML } from '../../lib/escape';
import { htmlToMarkdown } from '../../lib/canvas/htmlToMarkdown';
import { renderMarkdownPlain } from '../../lib/markdown/render';
import { LANG_EXT, LANG_MIME, NO_PREVIEW_DOC, buildPreviewDoc, isPreviewable } from '../../lib/artifacts/preview';
import { setCanvasWanted, updateCanvasContent, updateCanvasTitle, useCanvasState } from '../../stores/canvasStore';
import { showToast, useUiState } from '../../stores/uiStore';
import { isStreaming, sendMessage } from '../../stores/sendActions';
import { cn } from '../../lib/cn';
import type { CanvasDocument } from '../../types/canvas';

const MENU_ITEMS: Record<'doc' | 'code', Array<[string, string]>> = {
  doc: [
    ['Make shorter', 'Make the following text noticeably shorter while keeping every key point.'],
    ['Make longer', 'Expand the following text with more detail, depth, and examples.'],
    ['Fix grammar', 'Fix all grammar, spelling, and punctuation mistakes in the following text.'],
    ['Improve writing', 'Improve the clarity, flow, and word choice of the following text.'],
    ['Add detail', 'Add concrete details and examples to the following text.'],
    ['Add comments', 'Give feedback and improvement suggestions on the following text as comments.'],
    ['Add emojis', 'Add fitting emojis to the following text without changing its meaning.']
  ],
  code: [
    ['Find bugs', 'Review the following code for bugs and correctness problems. List each issue and its fix.'],
    ['Optimize', 'Optimize the following code for performance and readability.'],
    ['Add comments', 'Add concise, helpful comments to the following code.'],
    ['Write tests', 'Write unit tests for the following code.'],
    ['Explain', 'Briefly explain what the following code does.'],
    ['Refactor', 'Refactor the following code into a cleaner, more idiomatic version.']
  ]
};

const SELECTION_INSTRUCTIONS: Record<string, string> = {
  shorter: 'Make the selected text shorter without losing its meaning.',
  longer: 'Expand the selected text with more detail.',
  grammar: 'Fix grammar, spelling, and punctuation in the selected text.',
  improve: 'Rewrite the selected text so it is clearer and reads better.'
};

/** "Edit with AI" from the canvas panel: send the instruction as a prompt. */
const requestAIEdit = (instruction: string, selection: string): void => {
  if (!instruction || isStreaming()) return;
  let prompt = instruction;
  if (selection) prompt += `\n\nSelected text:\n"""\n${selection}\n"""`;
  void sendMessage(prompt, []);
};

/**
 * Canvas side panel — WYSIWYG document, markdown source, and code editors
 * with a live preview. Port of js/canvas.js + the panel markup.
 */
export function CanvasPanel(): JSX.Element {
  const { canvas, wanted, revision } = useCanvasState();
  const { sidePanel } = useUiState();

  const [view, setView] = useState<'main' | 'alt'>('main');
  const [askOpen, setAskOpen] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const titleRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const codeHlRef = useRef<HTMLElement | null>(null);
  const selToolbarRef = useRef<HTMLDivElement | null>(null);
  const lastSelectionRef = useRef('');
  const lastAppliedRef = useRef<{ doc: string | null; source: string | null; code: string | null }>({
    doc: null,
    source: null,
    code: null
  });

  const open = wanted && sidePanel === 'canvas';
  const isDoc = canvas?.type === 'doc';
  const altOK = canvas ? isDoc || isPreviewable(canvas.lang) : false;
  const showDoc = !!canvas && isDoc && view === 'main';
  const showSource = !!canvas && isDoc && view === 'alt';
  const showCode = !!canvas && !isDoc && view === 'main';
  const showPreview = !!canvas && !isDoc && view === 'alt' && isPreviewable(canvas.lang);

  // Fresh values for DOM listeners registered on mount
  const openRef = useRef(open);
  openRef.current = open;
  const showPreviewRef = useRef(showPreview);
  showPreviewRef.current = showPreview;

  /* ── External updates (model block / session restore) ────────────── */

  useEffect(() => {
    // Legacy applyCanvasBlock/restoreCanvas: reset to the main editor view.
    setView('main');
    setAskOpen(false);
    setPreviewError('');
    lastAppliedRef.current = { doc: null, source: null, code: null };
  }, [revision]);

  // Keep the view valid for the current file type
  useEffect(() => {
    if (view === 'alt' && canvas && !altOK) setView('main');
  }, [view, canvas, altOK]);

  // Apply store content into whichever editor is visible (never while the
  // user is typing there — store edits from those editors don't bump revision)
  useEffect(() => {
    if (!open) return;
    if (!canvas) {
      if (titleRef.current && document.activeElement !== titleRef.current) titleRef.current.value = '';
      return;
    }
    const content = canvas.content || '';
    if (showDoc && docRef.current && lastAppliedRef.current.doc !== content) {
      docRef.current.innerHTML = renderMarkdownPlain(content);
      lastAppliedRef.current.doc = content;
    }
    if (showSource && sourceRef.current && lastAppliedRef.current.source !== content) {
      sourceRef.current.value = content;
      lastAppliedRef.current.source = content;
    }
    if (showCode && codeRef.current && lastAppliedRef.current.code !== content) {
      codeRef.current.value = content;
      lastAppliedRef.current.code = content;
      applyHighlight(codeRef.current, codeHlRef.current, canvas.lang);
    }
    // Title input: don't clobber while focused (legacy behaviour)
    if (titleRef.current && document.activeElement !== titleRef.current) {
      titleRef.current.value = canvas.title || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, revision, canvas]);

  /* ── Preview iframe errors ─────────────────────────────────────────── */

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const data = e.data as { __artifactError?: boolean; message?: string; stack?: string } | null;
      if (!data || data.__artifactError !== true) return;
      if (!openRef.current || !showPreviewRef.current) return;
      setPreviewError((data.message || 'Preview error') + (data.stack ? `\n\n${data.stack}` : ''));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setPreviewError('');
  }, [view, revision]);

  /* ── Ask-AI menu: close on outside click ───────────────────────────── */

  useEffect(() => {
    if (!askOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (target.closest('.canvas-menu') || target.closest('#canvas-btn-ask')) return;
      setAskOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [askOpen]);

  /* ── Selection toolbar (doc / main view) ───────────────────────────── */

  useEffect(() => {
    if (!open || !canvas || !isDoc || view !== 'main') {
      hideSelToolbar();
      return;
    }
    const onSelectionChange = (): void => {
      requestAnimationFrame(() => updateSelToolbar());
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canvas, isDoc, view]);

  const updateSelToolbar = (): void => {
    const tb = selToolbarRef.current;
    const doc = docRef.current;
    if (!tb || !doc) return;
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hideSelToolbar();
    const range = sel.getRangeAt(0);
    if (!doc.contains(range.commonAncestorContainer)) return hideSelToolbar();
    const text = sel.toString().trim();
    if (!text) return hideSelToolbar();

    lastSelectionRef.current = text;
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

  const hideSelToolbar = (): void => {
    const tb = selToolbarRef.current;
    if (tb) tb.style.display = 'none';
  };

  /* ── Preview document ──────────────────────────────────────────────── */

  const srcDoc = useMemo(() => {
    if (!canvas || !showPreview) return '';
    const doc = buildPreviewDoc({ lang: canvas.lang, code: canvas.content || '' });
    return doc == null ? NO_PREVIEW_DOC : doc;
  }, [canvas, showPreview]);

  /* ── Derived strings ───────────────────────────────────────────────── */

  const badgeText = !canvas ? 'Canvas' : isDoc ? 'DOC' : String(canvas.lang || 'code').toUpperCase();
  const stats = canvas ? canvasStats(canvas) : '';

  /* ── Handlers ──────────────────────────────────────────────────────── */

  const handleDocInput = (): void => {
    const doc = docRef.current;
    if (!doc || !canvas) return;
    updateCanvasContent(htmlToMarkdown(doc));
  };

  const handleDocPaste = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain') || '';
    if (html && typeof DOMPurify !== 'undefined') {
      const clean = DOMPurify.sanitize(html, {
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed']
      });
      document.execCommand('insertHTML', false, clean);
    } else {
      document.execCommand('insertText', false, text);
    }
  };

  const handleToolbarCommand = (cmd: string, val?: string): void => {
    const doc = docRef.current;
    if (!doc) return;
    doc.focus();
    try {
      if (cmd === 'formatBlock') document.execCommand('formatBlock', false, `<${val}>`);
      else if (cmd === 'createLink') {
        const url = window.prompt('Link URL');
        if (url) document.execCommand('createLink', false, url);
      } else if (cmd === 'inlineCode') {
        const selected = String(document.getSelection() || '');
        document.execCommand('insertHTML', false, `<code>${escapeHTML(selected || 'code')}</code>`);
      } else {
        document.execCommand(cmd, false, val);
      }
    } catch {
      /* command unsupported — ignore */
    }
    handleDocInput();
  };

  const handleCodeInput = (ta: HTMLTextAreaElement): void => {
    if (!canvas) return;
    updateCanvasContent(ta.value);
    applyHighlight(ta, codeHlRef.current, canvas.lang);
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.currentTarget;
    const { selectionStart, selectionEnd, value } = ta;
    ta.value = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd);
    ta.selectionStart = ta.selectionEnd = selectionStart + 4;
    handleCodeInput(ta);
  };

  const handleCopy = (): void => {
    if (!canvas) return;
    void navigator.clipboard.writeText(canvas.content || '');
    showToast('Canvas content copied', 'success');
  };

  const handleDownload = (): void => {
    if (!canvas) return;
    const docType = canvas.type === 'doc';
    const ext = docType ? 'md' : LANG_EXT[(canvas.lang || '').toLowerCase()] || 'txt';
    const mime = docType ? 'text/markdown' : LANG_MIME[ext] || 'text/plain';
    const base =
      (canvas.title || 'canvas').replace(/[^\w\d\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'canvas';
    const blob = new Blob([canvas.content || ''], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const menuKind: 'doc' | 'code' = !canvas || isDoc ? 'doc' : 'code';

  return (
    <aside
      className={cn('canvas-panel', open && 'canvas-panel--open')}
      id="canvas-panel"
      aria-hidden={!open}
    >
      <div className="canvas-panel__header">
        <div className="canvas-panel__title-wrap">
          <span className="canvas-panel__icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="15"
              height="15"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="13" y2="17" />
            </svg>
          </span>
          <input
            className="canvas-panel__title"
            id="canvas-title-input"
            ref={titleRef}
            placeholder="Untitled"
            spellCheck={false}
            autoComplete="off"
            defaultValue={canvas?.title || ''}
            onBlur={(e) => updateCanvasTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          <span className={cn('canvas-panel__badge', !isDoc && canvas && 'canvas-panel__badge--code')} id="canvas-badge">
            {badgeText}
          </span>
        </div>
        <div className="canvas-panel__actions">
          <button
            type="button"
            className={cn('artifact-btn', askOpen && 'artifact-btn--active')}
            id="canvas-btn-ask"
            title="Ask AI to edit the canvas"
            onClick={(e) => {
              e.stopPropagation();
              setAskOpen((v) => !v);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
              <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
            </svg>
            Edit with AI
          </button>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="canvas-btn-copy"
            title="Copy content"
            onClick={handleCopy}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="canvas-btn-download"
            title="Download"
            onClick={handleDownload}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="canvas-btn-close"
            title="Close canvas"
            onClick={() => setCanvasWanted(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {askOpen && (
            <div className="canvas-menu" id="canvas-ask-menu">
              {MENU_ITEMS[menuKind].map(([label, instruction]) => (
                <button
                  key={label}
                  type="button"
                  className="canvas-menu__item"
                  onClick={(e) => {
                    e.stopPropagation();
                    const useSelection = menuKind === 'doc' && lastSelectionRef.current;
                    setAskOpen(false);
                    requestAIEdit(instruction, useSelection ? lastSelectionRef.current : '');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="canvas-toolbar"
        id="canvas-toolbar"
        style={{ display: showDoc ? 'flex' : 'none' }}
      >
        <button type="button" data-cmd="bold" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('bold')}>
          <b>B</b>
        </button>
        <button type="button" data-cmd="italic" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('italic')}>
          <i>I</i>
        </button>
        <button type="button" data-cmd="formatBlock" data-val="h1" title="Heading 1" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('formatBlock', 'h1')}>
          H1
        </button>
        <button type="button" data-cmd="formatBlock" data-val="h2" title="Heading 2" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('formatBlock', 'h2')}>
          H2
        </button>
        <button type="button" data-cmd="formatBlock" data-val="blockquote" title="Quote" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('formatBlock', 'blockquote')}>
          ❝
        </button>
        <button type="button" data-cmd="insertUnorderedList" title="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('insertUnorderedList')}>
          •
        </button>
        <button type="button" data-cmd="insertOrderedList" title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('insertOrderedList')}>
          1.
        </button>
        <button type="button" data-cmd="inlineCode" title="Inline code" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('inlineCode')}>
          &lt;/&gt;
        </button>
        <button type="button" data-cmd="createLink" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('createLink')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
        </button>
        <span className="canvas-toolbar__sep" />
        <button type="button" data-cmd="undo" title="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('undo')}>
          ↺
        </button>
        <button type="button" data-cmd="redo" title="Redo" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarCommand('redo')}>
          ↻
        </button>
      </div>

      <div className="canvas-panel__body" id="canvas-body">
        <div className="canvas-empty" id="canvas-empty" style={{ display: canvas ? 'none' : 'flex' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="34" height="34">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
          <h3>Canvas is on</h3>
          <p>
            Ask YA Chat to draft, write, or edit something and it opens here — then keep refining it
            together.
          </p>
        </div>
        <div
          className="canvas-doc"
          id="canvas-doc"
          ref={docRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          style={{ display: showDoc ? 'block' : 'none' }}
          onInput={handleDocInput}
          onPaste={handleDocPaste}
        />
        <textarea
          className="canvas-source"
          id="canvas-source"
          ref={sourceRef}
          spellCheck={false}
          style={{ display: showSource ? 'block' : 'none' }}
          defaultValue=""
          onChange={(e) => updateCanvasContent(e.target.value)}
        />
        <div className="canvas-code" id="canvas-code" style={{ display: showCode ? 'block' : 'none' }}>
          <pre className="canvas-code__hl" aria-hidden="true">
            <code id="canvas-code-hl" ref={codeHlRef} />
          </pre>
          <textarea
            className="canvas-code__input"
            id="canvas-code-input"
            ref={codeRef}
            spellCheck={false}
            wrap="off"
            defaultValue=""
            onScroll={(e) => {
              if (codeHlRef.current) {
                codeHlRef.current.scrollTop = e.currentTarget.scrollTop;
                codeHlRef.current.scrollLeft = e.currentTarget.scrollLeft;
              }
            }}
            onKeyDown={handleCodeKeyDown}
            onChange={(e) => handleCodeInput(e.currentTarget)}
          />
        </div>
        <iframe
          className="canvas-preview__frame"
          id="canvas-preview-frame"
          title="Canvas preview"
          sandbox="allow-scripts allow-modals allow-popups allow-forms allow-pointer-lock"
          style={{ display: showPreview ? 'block' : 'none' }}
          srcDoc={srcDoc}
        />
        <div
          className="canvas-preview__error"
          id="canvas-preview-error"
          style={{ display: previewError ? 'block' : 'none' }}
        >
          {previewError}
        </div>
      </div>

      <div className="canvas-panel__footer">
        <span className="canvas-stats" id="canvas-stats">
          {stats}
        </span>
        <div className="canvas-viewtoggle" id="canvas-viewtoggle" style={{ display: canvas && altOK ? 'flex' : 'none' }}>
          <button
            type="button"
            className={cn('canvas-viewtoggle__btn', view === 'main' && 'is-active')}
            id="canvas-btn-view-main"
            onClick={() => setView('main')}
          >
            {isDoc ? 'Write' : 'Code'}
          </button>
          <button
            type="button"
            className={cn('canvas-viewtoggle__btn', view === 'alt' && 'is-active')}
            id="canvas-btn-view-alt"
            onClick={() => setView('alt')}
          >
            {isDoc ? 'Source' : 'Preview'}
          </button>
        </div>
      </div>

      <div className="canvas-sel-toolbar" id="canvas-sel-toolbar" ref={selToolbarRef} style={{ display: 'none' }}>
        {(['shorter', 'longer', 'grammar', 'improve'] as const).map((key) => (
          <button
            key={key}
            type="button"
            data-sel={key}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const selection = lastSelectionRef.current;
              hideSelToolbar();
              requestAIEdit(SELECTION_INSTRUCTIONS[key] || 'Edit the selected text.', selection);
            }}
          >
            {key === 'shorter' ? 'Shorter' : key === 'longer' ? 'Longer' : key === 'grammar' ? 'Fix' : 'Rewrite'}
          </button>
        ))}
      </div>
    </aside>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

const applyHighlight = (
  ta: HTMLTextAreaElement,
  codeEl: HTMLElement | null,
  lang: string | undefined
): void => {
  if (!codeEl) return;
  const language = (lang || 'plaintext').toLowerCase();
  let html = escapeHTML(ta.value);
  try {
    if (hljs.getLanguage(language)) {
      html = hljs.highlight(ta.value, { language }).value;
    }
  } catch {
    html = escapeHTML(ta.value);
  }
  codeEl.className = `hljs language-${language}`;
  codeEl.innerHTML = html;
};

const canvasStats = (canvas: CanvasDocument): string => {
  const c = canvas.content || '';
  if (canvas.type === 'doc') {
    const words = c.trim() ? c.trim().split(/\s+/).length : 0;
    return `${words.toLocaleString()} words · ${c.length.toLocaleString()} characters`;
  }
  return `${c.split('\n').length.toLocaleString()} lines · ${c.length.toLocaleString()} characters`;
};
