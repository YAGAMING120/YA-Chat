/**
 * Artifact Panel — displays AI-generated files in a side panel
 * with tabs, syntax highlighting, copy, and download.
 */

/** Map: language string → file extension */
const LANG_EXT = {
    javascript: 'js', js: 'js',
    typescript: 'ts', ts: 'ts',
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
    text: 'txt', plaintext: 'txt',
};

/** Language → MIME type for Blob downloads */
const LANG_MIME = {
    html: 'text/html', css: 'text/css',
    js: 'text/javascript', ts: 'text/typescript',
    json: 'application/json', md: 'text/markdown',
    py: 'text/x-python', sh: 'text/x-sh',
    sql: 'text/x-sql', xml: 'application/xml',
};

/** All open artifact tabs: [{id, filename, lang, code}] */
let artifacts = [];
let activeArtifactId = null;
let artifactCounter = 0;

const panel     = () => document.getElementById('artifact-panel');
const tabsEl    = () => document.getElementById('artifact-tabs');
const bodyEl    = () => document.getElementById('artifact-body');
const filenameEl= () => document.getElementById('artifact-filename');

/** Derive a filename from the language tag */
const deriveFilename = (lang, index) => {
    const ext = LANG_EXT[lang?.toLowerCase()] || 'txt';
    return `file_${index}.${ext}`;
};

/** Render highlighted code into the artifact body */
const renderArtifactBody = (artifact) => {
    const lang = artifact.lang || 'plaintext';
    let highlighted = artifact.code;
    try {
        const validLang = window.hljs?.getLanguage(lang) ? lang : 'plaintext';
        highlighted = window.hljs.highlight(artifact.code, { language: validLang }).value;
    } catch (e) {}

    bodyEl().innerHTML = `<pre class="artifact-pre"><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    filenameEl().textContent = artifact.filename;
};

/** Re-render the tabs bar */
const renderTabs = () => {
    const el = tabsEl();
    el.innerHTML = '';
    artifacts.forEach(art => {
        const tab = document.createElement('button');
        tab.className = `artifact-tab ${art.id === activeArtifactId ? 'artifact-tab--active' : ''}`;
        tab.textContent = art.filename;
        tab.title = art.filename;
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

    const artifact = { id, filename, lang: lang || 'plaintext', code };
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
    bodyEl().innerHTML = '';
    filenameEl().textContent = '';
};

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
};
