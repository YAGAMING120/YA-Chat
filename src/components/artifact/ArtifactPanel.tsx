import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js';
import {
  LANG_EXT,
  LANG_MIME,
  NO_PREVIEW_DOC,
  buildPreviewDoc,
  isPreviewable
} from '../../lib/artifacts/preview';
import {
  artifactStore,
  closeArtifact,
  closeArtifactPanel,
  setArtifactMode,
  switchArtifact,
  useArtifactState
} from '../../stores/artifactStore';
import { useUiState } from '../../stores/uiStore';

/**
 * Artifact side panel — tabs + syntax-highlighted code view + Claude-style
 * live preview iframe. Port of js/artifact.js + the panel markup.
 */
export function ArtifactPanel(): JSX.Element {
  const { artifacts, activeId } = useArtifactState();
  const { sidePanel } = useUiState();
  const active = artifacts.find((a) => a.id === activeId) ?? null;

  const [copied, setCopied] = useState(false);
  const [rerunTick, setRerunTick] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = sidePanel === 'artifact';
  const previewable = active ? isPreviewable(active.lang) : false;
  const showPreview = !!(previewable && active?.mode === 'preview');

  // Highlighted code (legacy renderCode)
  const highlighted = useMemo(() => {
    if (!active || showPreview) return '';
    const lang = active.lang || 'plaintext';
    try {
      const validLang = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(active.code, { language: validLang }).value;
    } catch {
      return active.code;
    }
  }, [active, showPreview]);

  // Live preview document (legacy renderPreview)
  const srcDoc = useMemo(() => {
    if (!active || !showPreview) return '';
    const doc = buildPreviewDoc(active);
    return doc == null ? NO_PREVIEW_DOC : doc;
    // rerunTick forces a rebuild on the re-run button
  }, [active, showPreview, rerunTick]);

  // Runtime errors posted from inside the sandboxed iframe
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const data = e.data as { __artifactError?: boolean; message?: string; stack?: string } | null;
      if (!data || data.__artifactError !== true) return;
      if (!artifactStore.get().artifacts.length) return;
      setPreviewError((data.message || 'Preview error') + (data.stack ? `\n\n${data.stack}` : ''));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Clear the error when switching files / views
  useEffect(() => {
    setPreviewError('');
  }, [activeId, showPreview]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    []
  );

  if (artifacts.length === 0) return <aside id="artifact-panel" className="artifact-panel" aria-hidden="true" />;

  const handleCopy = (): void => {
    if (!active) return;
    void navigator.clipboard.writeText(active.code);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = (): void => {
    if (!active) return;
    const ext = LANG_EXT[active.lang?.toLowerCase()] || 'txt';
    const mime = LANG_MIME[ext] || 'text/plain';
    const blob = new Blob([active.code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = active.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNewTab = (): void => {
    if (!active) return;
    const doc = buildPreviewDoc(active);
    if (doc == null) return;
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <aside
      className={`artifact-panel${open ? ' artifact-panel--open' : ''}`}
      id="artifact-panel"
      aria-hidden={!open}
    >
      <div className="artifact-panel__header">
        <div className="artifact-panel__tabs" id="artifact-tabs">
          {artifacts.map((art) => (
            <button
              key={art.id}
              type="button"
              className={`artifact-tab${art.id === activeId ? ' artifact-tab--active' : ''}`}
              title={art.filename}
              onClick={() => switchArtifact(art.id)}
            >
              <span>{art.filename}</span>
              <span
                className="artifact-tab__close"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  closeArtifact(art.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="artifact-panel__actions">
          <div
            className="artifact-viewtoggle"
            id="artifact-viewtoggle"
            style={{ display: previewable ? 'flex' : 'none' }}
          >
            <button
              type="button"
              className={`artifact-viewtoggle__btn${showPreview ? ' artifact-viewtoggle__btn--active' : ''}`}
              id="artifact-btn-mode-preview"
              title="Preview"
              onClick={() => setArtifactMode('preview')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </button>
            <button
              type="button"
              className={`artifact-viewtoggle__btn${!showPreview ? ' artifact-viewtoggle__btn--active' : ''}`}
              id="artifact-btn-mode-code"
              title="Code"
              onClick={() => setArtifactMode('code')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Code
            </button>
          </div>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="artifact-btn-rerun"
            title="Re-run preview"
            style={{ display: previewable && showPreview ? 'flex' : 'none' }}
            onClick={() => {
              setPreviewError('');
              setRerunTick((t) => t + 1);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
          </button>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="artifact-btn-newtab"
            title="Open preview in new tab"
            style={{ display: previewable && showPreview ? 'flex' : 'none' }}
            onClick={handleNewTab}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <button
            type="button"
            className="artifact-btn"
            id="artifact-btn-download"
            title="Download file"
            onClick={handleDownload}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </button>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="artifact-btn-copy"
            title="Copy code"
            onClick={handleCopy}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="artifact-btn artifact-btn--icon"
            id="artifact-btn-close"
            title="Close panel"
            onClick={closeArtifactPanel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="artifact-panel__filename" id="artifact-filename">
        {active?.filename ?? ''}
      </div>
      <div className="artifact-panel__body" id="artifact-body">
        <pre className="artifact-pre" id="artifact-code-view" style={{ display: showPreview ? 'none' : 'block' }}>
          <code
            id="artifact-code-el"
            className={`hljs language-${active?.lang ?? 'plaintext'}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
        <div
          className="artifact-preview"
          id="artifact-preview-view"
          style={{ display: showPreview ? 'flex' : 'none' }}
        >
          <iframe
            className="artifact-preview__frame"
            id="artifact-preview-frame"
            title="Live preview"
            sandbox="allow-scripts allow-modals allow-popups allow-forms allow-pointer-lock"
            srcDoc={srcDoc}
          />
          <div
            className="artifact-preview__error"
            id="artifact-preview-error"
            style={{ display: previewError ? 'block' : 'none' }}
          >
            {previewError}
          </div>
        </div>
      </div>
    </aside>
  );
}
