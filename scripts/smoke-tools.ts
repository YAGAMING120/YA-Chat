/**
 * toolsStore + tools/TTS helper smoke test (payload building, chip labels,
 * persistence, markdown stripping for speech). Run: npm run test:smoke
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

async function main(): Promise<void> {
  const tools = await import('../src/stores/toolsStore');
  const lib = await import('../src/lib/tools');
  const { loadToolState } = await import('../src/services/storage/tools');
  const { toSpeechText, TTS_MAX_CHARS } = await import('../src/lib/tts');

  console.log('toolsStore: defaults + toggles');
  check('starts with nothing enabled', tools.getEnabledToolIds().length === 0);
  check('empty payload when idle', Object.keys(tools.buildToolsPayload()).length === 0);

  tools.setToolEnabled('web_search', true);
  tools.setToolEnabled('datetime', true);
  check('enabled ids listed in registry order', tools.getEnabledToolIds().join(',') === 'web_search,datetime');

  const stored = JSON.parse(mem.get('or_tools_v1') as string) as {
    enabled: Record<string, boolean>;
    imageModel: string;
  };
  check('state persisted to or_tools_v1', stored.enabled.web_search === true && stored.enabled.datetime === true);
  check('reload from storage matches', loadToolState().enabled.web_search === true);

  console.log('toolsStore: payload');
  const payload = tools.buildToolsPayload() as { tools: Array<{ type: string; parameters?: Record<string, unknown> }>; max_tool_calls: number };
  check('tools array + budget', payload.tools.length === 2 && payload.max_tool_calls === 8);
  check('web_search params', payload.tools[0]?.parameters?.max_results === 5 && payload.tools[0]?.parameters?.max_uses === 3);
  check('datetime has no params', payload.tools[1]?.type === 'openrouter:datetime' && payload.tools[1]?.parameters === undefined);

  tools.setToolEnabled('image_generation', true);
  tools.setImageModel('acme/img-1');
  const withImage = tools.buildToolsPayload() as { tools: Array<{ type: string; parameters?: Record<string, unknown> }> };
  const imageTool = withImage.tools.find((t) => t.type === 'openrouter:image_generation');
  check('image tool carries picked model', imageTool?.parameters?.model === 'acme/img-1');
  check('image model persisted', (JSON.parse(mem.get('or_tools_v1') as string) as { imageModel: string }).imageModel === 'acme/img-1');

  tools.setToolEnabled('web_search', false);
  tools.setToolEnabled('datetime', false);
  tools.setToolEnabled('image_generation', false);
  check('payload empties when all off', Object.keys(tools.buildToolsPayload()).length === 0);

  console.log('tools: chip labels');
  check('namespaced web_search', lib.getToolChipLabel('openrouter:web_search') === 'Searching the web…');
  check('bare id matches too', lib.getToolChipLabel('datetime') === 'Checking the date…');
  check('image generation', lib.getToolChipLabel('openrouter:image_generation') === 'Generating image…');
  check('unknown tool → null', lib.getToolChipLabel('openrouter:who_knows') === null);
  check('empty → null', lib.getToolChipLabel('') === null && lib.getToolChipLabel(null) === null);
  check('registry has four defs', lib.TOOL_DEFS.length === 4);

  console.log('tts: toSpeechText');
  const stripped = toSpeechText('## Hello **world**\n\nVisit [docs](https://example.com) for `info`.');
  check('markdown stripped for speech', stripped === 'Hello world Visit docs for info.');
  check('code fences removed', toSpeechText('before\n```js\nconst a = 1;\n```\nafter') === 'before after');
  check('html tags removed', toSpeechText('<p>hi <b>there</b></p>') === 'hi there');
  check('empty/none safe', toSpeechText('') === '' && toSpeechText(null) === '' && toSpeechText(undefined) === '');
  check('max chars constant', TTS_MAX_CHARS === 4000);

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
