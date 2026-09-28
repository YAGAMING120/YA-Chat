/**
 * Artifact preview documents — ported from js/artifact.js.
 *
 * Pure string builders: each returns a full HTML document for the sandboxed
 * preview iframe (or null when the file type has no live preview).
 */

/** Map: language string → file extension */
export const LANG_EXT: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  jsx: 'jsx',
  tsx: 'tsx',
  react: 'jsx',
  python: 'py',
  py: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  yaml: 'yml',
  yml: 'yml',
  markdown: 'md',
  md: 'md',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  sql: 'sql',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  rust: 'rs',
  go: 'go',
  php: 'php',
  ruby: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  xml: 'xml',
  toml: 'toml',
  lua: 'lua',
  luau: 'lua',
  svg: 'svg',
  text: 'txt',
  plaintext: 'txt'
};

/** Language → MIME type for Blob downloads */
export const LANG_MIME: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ts: 'text/typescript',
  jsx: 'text/javascript',
  tsx: 'text/typescript',
  json: 'application/json',
  md: 'text/markdown',
  py: 'text/x-python',
  sh: 'text/x-sh',
  sql: 'text/x-sql',
  xml: 'application/xml',
  svg: 'image/svg+xml'
};

/** Languages that can be instantly run/previewed, like Claude.ai artifacts */
const PREVIEWABLE_LANGS = new Set([
  'html',
  'svg',
  'javascript',
  'js',
  'jsx',
  'tsx',
  'react'
]);

export const isReactLang = (lang?: string | null): boolean =>
  ['jsx', 'tsx', 'react'].includes((lang || '').toLowerCase());

export const isPreviewable = (lang?: string | null): boolean =>
  PREVIEWABLE_LANGS.has((lang || '').toLowerCase());

/** Derive a filename from the language tag */
export const deriveFilename = (lang: string | undefined | null, index: number): string => {
  const ext = LANG_EXT[(lang || '').toLowerCase()] || 'txt';
  return `file_${index}.${ext}`;
};

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
const buildHtmlPreview = (code: string): string => {
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
const buildSvgPreview = (code: string): string => `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:
    repeating-conic-gradient(#f4f4f4 0% 25%, #fff 0% 50%) 50% / 16px 16px;}
  svg{max-width:100%;max-height:100vh;}
</style>${ERROR_BRIDGE}</head><body>${code}</body></html>`;

/** Build the preview document for vanilla JS artifacts (runs in a console-style sandbox) */
const buildJsPreview = (code: string): string => `<!doctype html><html><head><meta charset="utf-8">
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
const buildReactPreview = (code: string, lang: string): string => {
  const preset = lang === 'tsx' ? 'typescript' : null;
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
  .replace(/export\s+\{[^}]*\};?/g, '')}

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

export interface PreviewSource {
  lang?: string | null;
  code: string;
}

/** Build the preview document, or null when the type can't be previewed. */
export const buildPreviewDoc = (artifact: PreviewSource): string | null => {
  const lang = (artifact.lang || '').toLowerCase();
  if (lang === 'html') return buildHtmlPreview(artifact.code);
  if (lang === 'svg') return buildSvgPreview(artifact.code);
  if (isReactLang(lang)) return buildReactPreview(artifact.code, lang);
  if (lang === 'javascript' || lang === 'js') return buildJsPreview(artifact.code);
  return null;
};

/** Shown in the iframe when a file type has no live preview. */
export const NO_PREVIEW_DOC =
  '<!doctype html><html><body style="font-family:sans-serif;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">No live preview available for this file type.</body></html>';
