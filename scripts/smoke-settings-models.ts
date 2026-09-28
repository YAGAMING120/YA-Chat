/**
 * settingsStore + modelsStore smoke test (legacy migration, persistence,
 * theme, model cache/selection). Run: npm run test:smoke
 */
export {};

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear()
};

const attrs = new Map<string, string>();
(globalThis as Record<string, unknown>).document = {
  documentElement: {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null
  }
};
(globalThis as Record<string, unknown>).window = {
  matchMedia: (query: string) => ({
    matches: query.includes('dark'),
    addEventListener: () => undefined
  }),
  confirm: () => true,
  location: { reload: () => undefined }
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

const entry = (id: string, output: string[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name: id,
  owned_by: id.split('/')[0] ?? 'x',
  free: id.endsWith(':free') || id === 'openrouter/free',
  description: '',
  input: ['text'],
  output,
  voices: [],
  caps: { in: ['text'], out: output, params: [], ctx: 4096, maxOut: null },
  ...extra
});

async function main(): Promise<void> {
  const settings = await import('../src/stores/settingsStore');
  const models = await import('../src/stores/modelsStore');

  console.log('settingsStore: legacy migration');
  mem.set(
    'opencode_zen_settings',
    JSON.stringify({ apiKey: 'sk-legacy-old', temperature: 0.2, theme: 'light' })
  );
  settings.initSettings();
  let s = settings.settingsStore.get().settings;
  check('settings loaded', settings.settingsStore.get().loaded === true);
  check('legacy key NOT carried over', s.apiKey === '');
  check('legacy non-key values migrated', s.temperature === 0.2 && s.theme === 'light');
  check('legacy blob removed', !mem.has('opencode_zen_settings'));
  check('defaults merged in', s.maxTokens === 4096 && s.topP === 1.0);

  console.log('settingsStore: persistence');
  settings.setApiKey('  sk-or-test-123  ');
  settings.setTemperature(1.3);
  settings.setSystemPrompt('Be brief');
  s = settings.getSettings();
  check('api key trimmed on save', s.apiKey === 'sk-or-test-123');
  check('getSettings returns a copy', settings.getSettings() !== s);
  const persisted = JSON.parse(mem.get('or_settings') as string) as Record<string, unknown>;
  check('settings written to or_settings', persisted.apiKey === 'sk-or-test-123');
  check('temperature persisted', persisted.temperature === 1.3);
  check('getApiKey helper', settings.getApiKey() === 'sk-or-test-123');

  console.log('settingsStore: theme');
  settings.setTheme('light');
  check('explicit theme applied to <html>', attrs.get('data-theme') === 'light');
  settings.setTheme('system');
  check('system theme follows matchMedia', attrs.get('data-theme') === 'dark');
  check('theme choice persisted', (JSON.parse(mem.get('or_settings') as string) as Record<string, unknown>).theme === 'system');

  console.log('modelsStore: cache adoption');
  mem.set('or_models_cache_time', JSON.stringify(Date.now()));
  mem.set(
    'or_models_cache_v3',
    JSON.stringify([
      entry('openrouter/free', ['text']),
      entry('acme/embed-1', ['embeddings']),
      entry('acme/voice:free', ['speech'], { voices: ['aura'] }),
      entry('acme/img', ['image'], { input: ['text', 'image'] })
    ])
  );
  mem.set('or_selected_model', JSON.stringify('acme/embed-1'));

  await models.initModels();
  const m = models.modelsStore.get();
  check('cache adopted without network', m.loaded === true && m.models.length === 4);
  check('catalog built from cache', m.catalog.size === 4);
  check('non-chat stored pick falls back to a chat model', m.selectedId === 'openrouter/free');
  check('fallback persisted', (JSON.parse(mem.get('or_selected_model') as string) as string) === 'openrouter/free');
  check('getSelectedModelId matches store', models.getSelectedModelId() === 'openrouter/free');
  check('getModelEntry finds rows', models.getModelEntry('acme/voice:free')?.voices[0] === 'aura');
  check('getModelEntry miss returns null', models.getModelEntry('nope') === null);

  console.log('modelsStore: selection + derived lists');
  models.selectModel('openrouter/free');
  check('selectModel updates store', models.getSelectedModelId() === 'openrouter/free');
  check('selected meta resolves through catalog', models.getSelectedMeta()?.output.includes('text') === true);
  check(
    'speech models listed',
    models.getSpeechModels().length === 1 && models.getSpeechModels()[0]!.id === 'acme/voice:free'
  );
  check(
    'image models listed',
    models.getImageModels().length === 1 && models.getImageModels()[0]!.id === 'acme/img'
  );

  console.log('modelsCache: expiry');
  mem.set('or_models_cache_time', JSON.stringify(Date.now() - 7_200_000));
  const cache = await import('../src/services/storage/modelsCache');
  check('expired cache rejected', cache.readModelsCache() === null);

  console.log('settingsStore: danger zone (Clear All Data)');
  const win = (globalThis as Record<string, unknown>).window as {
    confirm: () => boolean;
    location: { reload: () => void };
  };
  let reloaded = 0;
  win.location.reload = () => void reloaded++;
  mem.set('or_settings', JSON.stringify({ apiKey: 'sk-or-test' }));
  mem.set('or_session_abc', JSON.stringify({ id: 'abc', messages: [] }));
  win.confirm = () => false;
  settings.clearAllData();
  check('declined confirm keeps data', mem.has('or_settings') && mem.has('or_session_abc'));
  check('declined confirm does not reload', reloaded === 0);
  win.confirm = () => true;
  settings.clearAllData();
  check('confirmed clear wipes storage', mem.size === 0);
  check('confirmed clear reloads the page', reloaded === 1);

  console.log('composer: system prompt button wiring (legacy btn-system-prompt)');
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const composerSrc = readFileSync(
    join(process.cwd(), 'src', 'components', 'composer', 'Composer.tsx'),
    'utf8'
  );
  check('button keeps legacy id', composerSrc.includes('id="btn-system-prompt"'));
  check('button opens settings (legacy left it inert)', composerSrc.includes('onClick={openSettings}'));

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
