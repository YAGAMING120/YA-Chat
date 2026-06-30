/**
 * Artifact Panel — displays AI-generated files in a side panel
 * with tabs, syntax highlighting, copy, download, and a Claude-style
 * live "Preview" mode that instantly runs HTML / SVG / JS / React code
 * inside a sandboxed iframe.
 */

/** Map: language string → file extension */
const LANG_EXT = {
    javascript: 'js', js: 'js',
    typescript: 'ts', ts: 'ts',
    jsx: 'jsx', tsx: 'tsx', react: 'jsx',
    python: 'py', py: 'py',
    html: 'html', css: 'css',
    json: 'json', yaml: 'yml', yml: 'yml',
    markdown: 'md', md: 'md',
    bash: 'sh', sh: 'sh', shell: 'sh',
    sql: 'sql', java: 'java',
    cpp: 'cpp', c: 'c',
    rust: 'rs', go: 'go',
    php: 'php', ruby: 'rb',
    swift: 'swift', kotlin: 'kt',
    xml: 'xml', toml: 'toml',
    lua: 'lua', luau: 'lua',
    svg: 'svg',
    text: 'txt', plaintext: 'txt',
};

/** Language → MIME type for Blob downloads */
const LANG_MIME = {
    html: 'text/html', css: 'text/css',
    js: 'text/javascript', ts: 'text/typescript',
    jsx: 'text/javascript', tsx: 'text/typescript',
    json: 'application/json', md: 'text/markdown',
    py: 'text/x-python', sh: 'text/x-sh',
    sql: 'text/x-sql', xml: 'application/xml',
    svg: 'image/svg+xml',
};

/** Languages that can be instantly run/previewed, like Claude.ai artifacts */
const PREVIEWABLE_LANGS = new Set([
    'html', 'svg',
    'javascript', 'js',
    'jsx', 'tsx', 'react',
]);

const isReactLang = (lang) => ['jsx', 'tsx', 'react'].includes((lang || '').toLowerCase());
const isPreviewable = (lang) => PREVIEWABLE_LANGS.has((lang || '').toLowerCase());

/** All open artifact tabs: [{id, filename, lang, code, mode}] */
let artifacts = [];
let activeArtifactId = null;
let artifactCounter = 0;
let rerunTimer = null;

const panel        = () => document.getElementById('artifact-panel');
const tabsEl        = () => document.getElementById('artifact-tabs');
const codeViewEl    = () => document.getElementById('artifact-code-view');
const codeElInner   = () => document.getElementById('artifact-code-el');
const previewViewEl = () => document.getElementById('artifact-preview-view');
const previewFrame  = () => document.getElementById('artifact-preview-frame');
const previewErrEl  = () => document.getElementById('artifact-preview-error');
const filenameEl    = () => document.getElementById('artifact-filename');
const viewToggleEl  = () => document.getElementById('artifact-viewtoggle');
const rerunBtn      = () => document.getElementById('artifact-btn-rerun');
const newTabBtn     = () => document.getElementById('artifact-btn-newtab');

/** Derive a filename from the language tag */
const deriveFilename = (lang, index) => {
    const ext = LANG_EXT[lang?.toLowerCase()] || 'txt';
    return `file_${index}.${ext}`;
};

/* ────────────────────────────────────────────────────────────
   PREVIEW DOCUMENT BUILDERS
   ──────────────────────────────────────────────────────────── */

/** Shared error-capturing bootstrap injected into every preview doc */
const ERROR_BRIDGE = `
<script>
  window.addEventListener('error', function (e) {
    parent.postMessage({ __artifactError: true, message: (e.error && e.error.message) || e.message, stack: e.error && e.error.stack }, '*');
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    parent.postMessage({ __artifactError: true, message: 'Unhandled promise rejection: ' + (reason && reason.message ? reason.message : reason), stack: reason && reason.stack }, '*');
  });
  var __origConsoleError = console.error;
  console.error = function () {
    parent.postMessage({ __artifactError: true, message: Array.from(arguments).map(String).join(' ') }, '*');
    __origConsoleError.apply(console, arguments);
  };
<\/script>
`;

const baseStyles = `
<style>
  html, body { margin:0; padding:0; background:#fff; color:#111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  #root, #app-root { min-height: 100vh; }
</style>
`;

/** Build the preview document for plain HTML artifacts */
const buildHtmlPreview = (code) => {
    const hasDoctypeOrHtml = /<!doctype html|<html[\s>]/i.test(code);
    if (hasDoctypeOrHtml) {
        // Inject error bridge right after <head> (or at top) so it always runs first
        if (/<head[^>]*>/i.test(code)) {
            return code.replace(/<head[^>]*>/i, (m) => `${m}${ERROR_BRIDGE}`);
        }
        return ERROR_BRIDGE + code;
    }
    return `<!doctype html><html><head><meta charset="utf-8">${baseStyles}${ERROR_BRIDGE}</head><body>${code}</body></html>`;
};

/** Build the preview document for raw SVG artifacts */
const buildSvgPreview = (code) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:
    repeating-conic-gradient(#f4f4f4 0% 25%, #fff 0% 50%) 50% / 16px 16px;}
  svg{max-width:100%;max-height:100vh;}
</style>${ERROR_BRIDGE}</head><body>${code}</body></html>`;

/** Build the preview document for vanilla JS artifacts (runs in a console-style sandbox) */
const buildJsPreview = (code) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#0d0d0d;color:#e0e0e0;font-family:'JetBrains Mono',monospace;}
  #app-root{padding:14px;min-height:40vh;}
  #console{border-top:1px solid #2d2d2d;padding:10px 14px;font-size:12.5px;white-space:pre-wrap;word-break:break-word;}
  .log-line{padding:3px 0;border-bottom:1px solid #1a1a1a;}
  .log-error{color:#ef4444;}
  .log-warn{color:#f59e0b;}
  .log-info{color:#60a5fa;}
</style>
${ERROR_BRIDGE}
</head><body>
<div id="app-root"></div>
<div id="console"></div>
<script>
  (function () {
    var consoleEl = document.getElementById('console');
    var log = function (type, args) {
      var line = document.createElement('div');
      line.className = 'log-line log-' + type;
      line.textContent = '› ' + Array.from(args).map(function (a) {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch (e) { return String(a); }
      }).join(' ');
      consoleEl.appendChild(line);
    };
    var orig = { log: console.log, warn: console.warn, info: console.info };
    console.log = function () { log('log', arguments); orig.log.apply(console, arguments); };
    console.warn = function () { log('warn', arguments); orig.warn.apply(console, arguments); };
    console.info = function () { log('info', arguments); orig.info.apply(console, arguments); };
  })();
<\/script>
<script>
${code}
<\/script>
</body></html>`;

/** Build the preview document for React (JSX/TSX) artifacts using Babel standalone in-browser */
const buildReactPreview = (code, lang) => {
    const preset = (lang === 'tsx') ? 'typescript' : null;
    return `<!doctype html><html><head><meta charset="utf-8">
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<script src="https://cdn.tailwindcss.com"><\/script>
${baseStyles}
${ERROR_BRIDGE}
</head><body>
<div id="root"></div>
<script type="text/babel" data-presets="react${preset ? ',' + preset : ''}" data-type="module">
const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, useLayoutEffect, Fragment } = React;

${code
    .replace(/^\s*import[^;]*?;?\s*$/gm, '')
    .replace(/export\s+default\s+/g, 'window.__ArtifactDefault__ = ')
    .replace(/export\s+\{[^}]*\};?/g, '')
}

setTimeout(function () {
  try {
    const Root = window.__ArtifactDefault__ || (typeof App !== 'undefined' ? App : null);
    if (!Root) throw new Error('No default export / App component found to render.');
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Root));
  } catch (e) {
    parent.postMessage({ __artifactError: true, message: e.message, stack: e.stack }, '*');
  }
}, 0);
<\/script>
</body></html>`;
};

const buildPreviewDoc = (artifact) => {
    const lang = (artifact.lang || '').toLowerCase();
    if (lang === 'html') return buildHtmlPreview(artifact.code);
    if (lang === 'svg') return buildSvgPreview(artifact.code);
    if (isReactLang(lang)) return buildReactPreview(artifact.code, lang);
    if (lang === 'javascript' || lang === 'js') return buildJsPreview(artifact.code);
    return null;
};

/* ────────────────────────────────────────────────────────────
   RENDERING
   ──────────────────────────────────────────────────────────── */

/** Render highlighted code into the code view */
const renderCode = (artifact) => {
    const lang = artifact.lang || 'plaintext';
    let highlighted = artifact.code;
    try {
        const validLang = window.hljs?.getLanguage(lang) ? lang : 'plaintext';
        highlighted = window.hljs.highlight(artifact.code, { language: validLang }).value;
    } catch (e) {
        highlighted = artifact.code;
    }
    const codeEl = codeElInner();
    codeEl.className = `hljs language-${lang}`;
    codeEl.innerHTML = highlighted;
};

/** Render the live preview iframe for the active artifact */
const renderPreview = (artifact) => {
    const doc = buildPreviewDoc(artifact);
    previewErrEl().style.display = 'none';
    previewErrEl().textContent = '';
    if (doc == null) {
        previewFrame().srcdoc = `<!doctype html><html><body style="font-family:sans-serif;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">No live preview available for this file type.</body></html>`;
        return;
    }
    previewFrame().srcdoc = doc;
};

/** Apply the artifact's current view mode (code vs preview) to the DOM */
const applyMode = (artifact) => {
    const previewable = isPreviewable(artifact.lang);
    viewToggleEl().style.display = previewable ? 'flex' : 'none';
    rerunBtn().style.display = (previewable && artifact.mode === 'preview') ? 'flex' : 'none';
    newTabBtn().style.display = (previewable && artifact.mode === 'preview') ? 'flex' : 'none';

    const showPreview = previewable && artifact.mode === 'preview';
    codeViewEl().style.display = showPreview ? 'none' : 'block';
    previewViewEl().style.display = showPreview ? 'flex' : 'none';

    document.querySelectorAll('.artifact-viewtoggle__btn').forEach(btn => {
        btn.classList.toggle('artifact-viewtoggle__btn--active', btn.dataset.mode === artifact.mode);
    });

    if (showPreview) {
        renderPreview(artifact);
    } else {
        renderCode(artifact);
    }
};

/** Re-render the active artifact body (called on open/switch/mode change) */
const renderArtifactBody = (artifact) => {
    filenameEl().textContent = artifact.filename;
    applyMode(artifact);
};

/** Re-render the tabs bar */
const renderTabs = () => {
    const el = tabsEl();
    el.innerHTML = '';
    artifacts.forEach(art => {
        const tab = document.createElement('button');
        tab.className = `artifact-tab ${art.id === activeArtifactId ? 'artifact-tab--active' : ''}`;
        tab.title = art.filename;

        const label = document.createElement('span');
        label.textContent = art.filename;
        tab.appendChild(label);

        tab.addEventListener('click', () => switchArtifact(art.id));

        // Close tab ×
        const x = document.createElement('span');
        x.className = 'artifact-tab__close';
        x.textContent = '×';
        x.title = 'Close tab';
        x.addEventListener('click', (e) => {
            e.stopPropagation();
            closeArtifact(art.id);
        });
        tab.appendChild(x);
        el.appendChild(tab);
    });
};

/** Switch to an artifact by id */
const switchArtifact = (id) => {
    activeArtifactId = id;
    const art = artifacts.find(a => a.id === id);
    if (art) renderArtifactBody(art);
    renderTabs();
};

/** Close one tab */
const closeArtifact = (id) => {
    artifacts = artifacts.filter(a => a.id !== id);
    if (artifacts.length === 0) {
        closePanel();
    } else {
        if (activeArtifactId === id) activeArtifactId = artifacts[artifacts.length - 1].id;
        switchArtifact(activeArtifactId);
        renderTabs();
    }
};

/** Open (or update) an artifact in the panel */
export const openArtifact = (code, lang, suggestedFilename) => {
    artifactCounter++;
    const id = `art_${artifactCounter}`;
    const filename = suggestedFilename || deriveFilename(lang, artifactCounter);
    const normalizedLang = (lang || 'plaintext').toLowerCase();

    const artifact = {
        id,
        filename,
        lang: normalizedLang,
        code,
        // Default to instant Preview for previewable types, like Claude.ai
        mode: isPreviewable(normalizedLang) ? 'preview' : 'code',
    };
    artifacts.push(artifact);
    activeArtifactId = id;

    panel()?.classList.add('artifact-panel--open');
    document.getElementById('app')?.classList.add('app--panel-open');

    renderTabs();
    renderArtifactBody(artifact);
};

/** Close the whole panel */
const closePanel = () => {
    artifacts = [];
    activeArtifactId = null;
    panel()?.classList.remove('artifact-panel--open');
    document.getElementById('app')?.classList.remove('app--panel-open');
    tabsEl().innerHTML = '';
    codeElInner().innerHTML = '';
    previewFrame().srcdoc = '';
    filenameEl().textContent = '';
};

/** Listen for runtime errors posted from inside the sandboxed preview iframe */
window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__artifactError) return;
    const box = previewErrEl();
    if (!box) return;
    box.style.display = 'block';
    box.textContent = e.data.message + (e.data.stack ? '\n\n' + e.data.stack : '');
});

/** Wire up panel buttons */
export const initArtifactPanel = () => {
    document.getElementById('artifact-btn-close')?.addEventListener('click', closePanel);

    document.getElementById('artifact-btn-copy')?.addEventListener('click', () => {
        const art = artifacts.find(a => a.id === activeArtifactId);
        if (!art) return;
        navigator.clipboard.writeText(art.code);
        const btn = document.getElementById('artifact-btn-copy');
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => btn.innerHTML = orig, 1500);
    });

    document.getElementById('artifact-btn-download')?.addEventListener('click', () => {
        const art = artifacts.find(a => a.id === activeArtifactId);
        if (!art) return;
        const ext = LANG_EXT[art.lang?.toLowerCase()] || 'txt';
        const mime = LANG_MIME[ext] || 'text/plain';
        const blob = new Blob([art.code], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = art.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Code / Preview toggle
    document.getElementById('artifact-btn-mode-preview')?.addEventListener('click', () => {
        const art = artifacts.find(a => a.id === activeArtifactId);
        if (!art) return;
        art.mode = 'preview';
        renderArtifactBody(art);
    });
    document.getElementById('artifact-btn-mode-code')?.addEventListener('click', () => {
        const art = artifacts.find(a => a.id === activeArtifactId);
        if (!art) return;
        art.mode = 'code';
        renderArtifactBody(art);
    });

    // Instant re-run
    document.getElementById('artifact-btn-rerun')?.addEventListener('click', () => {
        const art = artifacts.find(a => a.id === activeArtifactId);
        if (!art) return;
        clearTimeout(rerunTimer);
        rerunTimer = setTimeout(() => renderPreview(art), 50);
    });

    // Open live preview in a new browser tab
    document.getElementById('artifact-btn-newtab')?.addEventListener('click', () => {
        const art = artifacts.find(a => a.id === activeArtifactId);
        if (!art) return;
        const doc = buildPreviewDoc(art);
        if (doc == null) return;
        const blob = new Blob([doc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
};
