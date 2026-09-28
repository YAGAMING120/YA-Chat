/**
 * Artifact panel + Canvas store + preview builders smoke test.
 * Run: npm run test:smoke
 */
export {};

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear()
};

let failures = 0;
const check = (label: string, cond: boolean): void => {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const ui = await import('../src/stores/uiStore');
  const artifacts = await import('../src/stores/artifactStore');
  const canvas = await import('../src/stores/canvasStore');
  const preview = await import('../src/lib/artifacts/preview');

  console.log('preview builders');
  check('isPreviewable html/jsx', preview.isPreviewable('HTML') && preview.isPreviewable('tsx'));
  check('isPreviewable rejects css', !preview.isPreviewable('css') && !preview.isPreviewable(''));
  check('deriveFilename ext map', preview.deriveFilename('python', 2) === 'file_2.py');
  check('deriveFilename unknown → txt', preview.deriveFilename('brainfuck', 9) === 'file_9.txt');

  const htmlDoc = preview.buildPreviewDoc({ lang: 'html', code: '<p>hi</p>' }) ?? '';
  check('html doc wrapped + error bridge', htmlDoc.includes('<!doctype html>') && htmlDoc.includes('__artifactError'));
  const fullPage = preview.buildPreviewDoc({ lang: 'html', code: '<!doctype html><html><head><title>x</title></head><body>y</body></html>' }) ?? '';
  check('html head gets bridge injected', fullPage.indexOf('__artifactError') > fullPage.indexOf('<head>') && fullPage.indexOf('__artifactError') < fullPage.indexOf('</head>'));
  check('svg doc centers artwork', (preview.buildPreviewDoc({ lang: 'svg', code: '<svg/>' }) ?? '').includes('repeating-conic-gradient'));
  check('js doc has console sandbox', (preview.buildPreviewDoc({ lang: 'javascript', code: 'console.log(1)' }) ?? '').includes('id="console"'));
  const reactDoc = preview.buildPreviewDoc({ lang: 'tsx', code: 'export default function App(){return null}' }) ?? '';
  check('react doc uses babel + ts preset', reactDoc.includes('@babel/standalone') && reactDoc.includes('react,typescript'));
  check('react doc strips export default', !reactDoc.includes('export default function') && reactDoc.includes('window.__ArtifactDefault__'));
  check('css has no live preview', preview.buildPreviewDoc({ lang: 'css', code: 'a{}' }) === null);
  check('no-preview fallback doc', preview.NO_PREVIEW_DOC.includes('No live preview available'));

  console.log('artifactStore: tabs + exclusivity');
  artifacts.openArtifact('<h1>Page</h1>', 'html');
  check('first tab opens in preview mode', artifacts.artifactStore.get().artifacts[0]?.mode === 'preview');
  check('panel takes the side rail', ui.uiStore.get().sidePanel === 'artifact');
  artifacts.openArtifact('print(1)', 'python');
  check('second tab appended', artifacts.artifactStore.get().artifacts.length === 2);
  check('second tab opens in code mode', artifacts.artifactStore.get().artifacts[1]?.mode === 'code');
  const secondId = artifacts.artifactStore.get().artifacts[1]!.id;
  artifacts.switchArtifact(artifacts.artifactStore.get().artifacts[0]!.id);
  check('switch activates the tab', artifacts.artifactStore.get().activeId === artifacts.artifactStore.get().artifacts[0]!.id);
  artifacts.closeArtifact(secondId);
  check('closing a tab keeps the panel', artifacts.artifactStore.get().artifacts.length === 1);
  artifacts.closeArtifactPanel();
  check('panel close empties tabs + rail', artifacts.artifactStore.get().artifacts.length === 0 && ui.uiStore.get().sidePanel === null);

  console.log('canvasStore: protocol');
  canvas.applyCanvasBlock({ attrs: { type: 'doc', title: 'My Doc' }, content: '# Hello\n\nBody text' });
  let state = canvas.getCanvasState();
  check('block creates the canvas', state?.title === 'My Doc' && state?.type === 'doc' && state?.content === '# Hello\n\nBody text');
  check('opening canvas claims the rail', canvas.isCanvasWanted() && ui.uiStore.get().sidePanel === 'canvas');

  canvas.applyCanvasBlock({ attrs: { action: 'append' }, content: 'More.' });
  state = canvas.getCanvasState();
  check('append joins with blank line', state?.content === '# Hello\n\nBody text\n\nMore.');

  canvas.applyCanvasBlock({ attrs: { action: 'prepend' }, content: 'Intro.' });
  state = canvas.getCanvasState();
  check('prepend joins at the start', state?.content === 'Intro.\n\n# Hello\n\nBody text\n\nMore.');

  canvas.applyCanvasBlock({ attrs: { type: 'code', lang: 'javascript', title: 'Utils' }, content: 'const a = 1;' });
  state = canvas.getCanvasState();
  check('type switch replaces the canvas', state?.type === 'code' && state?.lang === 'javascript' && state?.title === 'Utils');
  check('code append uses single newline', (() => {
    canvas.applyCanvasBlock({ attrs: { lang: 'javascript', action: 'append' }, content: 'const b = 2;' });
    return canvas.getCanvasState()?.content === 'const a = 1;\nconst b = 2;';
  })());
  check('untyped block on a code canvas replaces it (legacy resolveCanvasType)', (() => {
    canvas.applyCanvasBlock({ attrs: { action: 'append' }, content: 'plain text' });
    const s = canvas.getCanvasState();
    return s?.type === 'doc' && s?.content === 'plain text';
  })());

  canvas.applyCanvasBlock({ attrs: {}, content: '# Derived title wins when no title attr' });
  state = canvas.getCanvasState();
  check('doc title derived from heading', state?.type === 'doc' && state?.title === 'Derived title wins when no title attr');

  const ctx = canvas.buildCanvasContext();
  check('context block includes current content', ctx.includes('<current_canvas') && ctx.includes('source of truth'));
  check('canvas instruction present', canvas.CANVAS_INSTRUCTION.includes('CANVAS mode is ON'));

  console.log('canvasStore: chip + restore + persistence');
  canvas.openCanvasFromChip({ attrs: { type: 'doc' }, content: 'chip body' });
  check('existing canvas just re-opens (no overwrite)', canvas.getCanvasState()?.content?.includes('Derived title') === true);
  canvas.restoreCanvas(null, false);
  check('restore clears state', canvas.getCanvasState() === null && !canvas.isCanvasWanted());

  let persisted: unknown = 'unset';
  canvas.registerCanvasPersister((c, w) => {
    persisted = { canvas: c, wanted: w };
  });
  canvas.restoreCanvas({ title: 'Restored', type: 'doc', lang: 'markdown', content: 'saved body', updatedAt: 1 }, true);
  const p = persisted as { canvas: { title: string } | null; wanted: boolean };
  check('restore notifies the persister', p.wanted === true && p.canvas?.title === 'Restored');
  check('restore claims the rail', ui.uiStore.get().sidePanel === 'canvas');

  console.log('side panel exclusivity (the legacy bug fix)');
  artifacts.openArtifact('x = 1', 'python');
  check('artifact steals the rail from canvas', ui.uiStore.get().sidePanel === 'artifact');
  check('canvas stays wanted underneath', canvas.isCanvasWanted());
  canvas.setCanvasWanted(false);
  check('closing canvas reveals the artifact panel', ui.uiStore.get().sidePanel === 'artifact');
  artifacts.closeArtifactPanel();
  check('closing everything clears the rail', ui.uiStore.get().sidePanel === null);

  console.log('debounced edit persistence');
  persisted = 'unset';
  canvas.restoreCanvas({ title: 'Edit Me', type: 'doc', lang: 'markdown', content: 'v1', updatedAt: 1 }, true);
  canvas.updateCanvasContent('v2');
  canvas.updateCanvasTitle('Renamed');
  check('edits do not persist synchronously', persisted === 'unset' || (persisted as { canvas: { content: string } }).canvas.content !== 'v2');
  await sleep(450);
  const afterDebounce = persisted as { canvas: { title: string; content: string } };
  check('debounced save carries the edits', afterDebounce.canvas.content === 'v2' && afterDebounce.canvas.title === 'Renamed');

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
