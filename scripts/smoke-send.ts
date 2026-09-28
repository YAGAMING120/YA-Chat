/**
 * Send pipeline smoke test: payload building, SSE streaming into the stream
 * store, persistence, stop/abort, API errors, and the canChat guard.
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

const entry = (id: string, output: string[]): Record<string, unknown> => ({
  id,
  name: id,
  owned_by: id.split('/')[0] ?? 'x',
  free: id.endsWith(':free'),
  description: '',
  input: ['text'],
  output,
  voices: [],
  caps: { in: ['text'], out: output, params: ['temperature'], ctx: 4096, maxOut: null }
});

const sse = (lines: string[]): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(enc.encode(line));
      controller.close();
    }
  });
};

/** One chunk, then stall until the request is aborted. */
const stallingSse = (first: string, signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(first));
      signal?.addEventListener('abort', () => {
        try {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
        } catch {
          /* already closed */
        }
      });
    }
  });
};

interface Captured {
  payload: Record<string, unknown> | null;
}

const capture = (impl: (init: RequestInit | undefined) => Response | Promise<Response>): Captured => {
  const cap: Captured = { payload: null };
  (globalThis as Record<string, unknown>).fetch = async (_url: unknown, init?: RequestInit) => {
    cap.payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    return impl(init);
  };
  return cap;
};

const okSse = (lines: string[]) => capture(() => ({ ok: true, body: sse(lines) }) as unknown as Response);

const waitUntil = async (cond: () => boolean): Promise<boolean> => {
  for (let i = 0; i < 1000; i++) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 1));
  }
  return cond();
};

async function main(): Promise<void> {
  const settings = await import('../src/stores/settingsStore');
  const models = await import('../src/stores/modelsStore');
  const chat = await import('../src/stores/chatStore');
  const composer = await import('../src/stores/composerStore');
  const stream = await import('../src/stores/streamStore');
  const ui = await import('../src/stores/uiStore');
  const send = await import('../src/stores/sendActions');
  const { buildCatalog } = await import('../src/lib/capabilities');

  settings.initSettings();
  settings.setApiKey('sk-or-smoke');
  settings.setSystemPrompt('Be brief');
  settings.setThinkingEnabled(true);
  chat.initChatStore();

  const rows = [entry('openrouter/free', ['text']), entry('acme/voice:free', ['speech'])];
  models.modelsStore.set({
    loaded: true,
    loading: false,
    error: null,
    models: rows as never,
    catalog: buildCatalog(rows as never),
    selectedId: 'openrouter/free'
  });

  console.log('sendActions: happy path (SSE → store → persistence)');
  let cap = okSse([
    'data: {"choices":[{"delta":{"reasoning":"let me think"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
    'data: {"choices":[{"delta":{"annotations":[{"url_citation":{"url":"https://example.com/page","title":"Example Page"}}]}}]}\n\n',
    'data: {"usage":{"total_tokens":42,"server_tool_use":{"web_search_requests":1}}}\n\n',
    'data: [DONE]\n\n'
  ]);
  await send.sendMessage('Hello there', []);

  const session = chat.chatStore.get().activeSession;
  const messages = session?.messages ?? [];
  check('user message appended', messages.length === 2 && messages[0]?.role === 'user');
  check('assistant reply persisted', messages[1]?.role === 'assistant');
  check('streamed content assembled', messages[1]?.content === 'Hello world');
  check('reasoning captured on message', messages[1]?.reasoning === 'let me think');
  check('usage meta line', messages[1]?.meta === '42 tokens • 1 web search');
  check(
    'citations normalized',
    Array.isArray(messages[1]?.annotations) &&
      messages[1]?.annotations?.[0]?.url === 'https://example.com/page' &&
      messages[1]?.annotations?.[0]?.host === 'example.com'
  );
  check('composer cleared', composer.composerStore.get().draft === '' && composer.composerStore.get().attachments.length === 0);
  check('stream store idle after success', stream.getStreamState().active === false && stream.getStreamState().error === null);
  check('session titled from first message', session?.title === 'Hello there');
  const list = chat.chatStore.get().sessionList;
  check('sidebar list refreshed', list.length === 1 && list[0]?.title === 'Hello there');
  const saved = JSON.parse(mem.get(`or_session_${session?.id}`) as string) as { messages: Array<{ meta?: string }> };
  check('assistant message written to storage', saved.messages.length === 2 && saved.messages[1]?.meta === '42 tokens • 1 web search');

  const payload = cap.payload as {
    model: string;
    stream: boolean;
    reasoning?: { enabled: boolean };
    messages: Array<{ role: string; content: unknown }>;
    temperature?: number;
  } | null;
  check('payload model + stream flag', payload?.model === 'openrouter/free' && payload?.stream === true);
  check('payload requests reasoning', payload?.reasoning?.enabled === true);
  check('payload carries settings sampling', payload?.temperature === settings.getSettings().temperature);
  check(
    'payload has project+user system message',
    payload?.messages[0]?.role === 'system' && payload?.messages[0]?.content === 'Be brief'
  );

  console.log('sendActions: multipart attachment');
  chat.createNewChat();
  cap = okSse(['data: {"choices":[{"delta":{"content":"Got it"}}]}\n\n', 'data: [DONE]\n\n']);
  await send.sendMessage('', [
    {
      name: 'notes.txt',
      ext: 'txt',
      category: 'text',
      icon: '\u{1F4C4}',
      size: 1024,
      sizeStr: '1.0 KB',
      mimeType: 'text/plain',
      type: 'text',
      content: 'hello file'
    }
  ]);
  const s2 = chat.chatStore.get().activeSession;
  const m2 = s2?.messages ?? [];
  const firstContent = m2[0]?.content;
  const parts = Array.isArray(firstContent) ? firstContent : [];
  const part0 = parts[0];
  check('attachment-only send accepted', m2.length === 2);
  check('content becomes multipart', parts.length === 1 && part0?.type === 'text');
  check(
    'text part wraps the file',
    part0?.type === 'text' && part0.text.includes('[File: notes.txt | 1.0 KB | TXT]')
  );
  check('title falls back to attachment name', s2?.title === 'notes.txt');
  const p2 = cap.payload as { messages: Array<{ content: unknown }> } | null;
  check('payload keeps multipart user content', Array.isArray(p2?.messages.at(-1)?.content));

  console.log('sendActions: stop mid-stream');
  (globalThis as Record<string, unknown>).fetch = async (_url: unknown, init?: RequestInit) =>
    ({ ok: true, body: stallingSse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', init?.signal) }) as unknown as Response;
  const pending = send.sendMessage('stop me', []);
  const started = await waitUntil(() => stream.getStreamState().started);
  check('live content reaches the stream store', started && stream.getStreamState().content === 'partial');
  send.stopStreaming();
  await pending;
  const m3 = chat.chatStore.get().activeSession?.messages ?? [];
  const last3 = m3.at(-1);
  check('stopped reply persisted with marker', last3?.role === 'assistant' && last3?.content === 'partial [Stopped]');
  check('stream store idle after stop', stream.getStreamState().active === false);

  console.log('sendActions: API error');
  (globalThis as Record<string, unknown>).fetch = async () =>
    ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Incorrect API key provided' } })
    }) as unknown as Response;
  const before = (chat.chatStore.get().activeSession?.messages.length ?? 0);
  await send.sendMessage('will fail', []);
  const after = chat.chatStore.get().activeSession?.messages ?? [];
  check('error surfaced inline', stream.getStreamState().error === 'Invalid OpenRouter API key. Check Settings.');
  check('no assistant message persisted on error', after.length === before + 1 && after.at(-1)?.role === 'user');
  check('stream inactive after error', stream.getStreamState().active === false);

  console.log('sendActions: canChat guard');
  models.selectModel('acme/voice:free');
  composer.setDraft('keep me');
  const guardBefore = chat.chatStore.get().activeSession?.messages.length ?? 0;
  await send.sendMessage('keep me', []);
  const toasts = ui.uiStore.get().toasts;
  check('blocks non-chat model', (chat.chatStore.get().activeSession?.messages.length ?? 0) === guardBefore);
  check('warns via toast', toasts.some((t) => t.message.includes("can't reply in chat")));
  check('opens the model picker', ui.uiStore.get().modelsOpen === true);
  check('composer untouched by guard', composer.composerStore.get().draft === 'keep me');
  models.selectModel('openrouter/free');

  console.log('sendActions: canvas protocol');
  const canvas = await import('../src/stores/canvasStore');
  canvas.applyCanvasBlock({ attrs: { type: 'doc', title: 'Notes' }, content: '# Notes\n\nhello canvas' });
  check('canvas opens the side panel', canvas.isCanvasWanted() && ui.uiStore.get().sidePanel === 'canvas');
  cap = okSse(['data: {"choices":[{"delta":{"content":"done"}}]}\n\n', 'data: [DONE]\n\n']);
  await send.sendMessage('open the canvas', []);
  const p3 = cap.payload as { messages: Array<{ role: string; content: string }> } | null;
  const sys3 = p3?.messages.find((m) => m.role === 'system');
  check('canvas instruction in system prompt', !!sys3 && sys3.content.includes('CANVAS mode is ON'));
  check(
    'current canvas context in system prompt',
    !!sys3 && sys3.content.includes('<current_canvas') && sys3.content.includes('hello canvas')
  );

  // The reply carries a <canvas> block → the panel must update from it
  cap = okSse([
    'data: {"choices":[{"delta":{"content":"<canvas title=\\"Updated Doc\\" type=\\"doc\\">\\n# Updated\\n\\nnew body</canvas>"}}]}\n\n',
    'data: [DONE]\n\n'
  ]);
  await send.sendMessage('update the canvas', []);
  const updated = canvas.getCanvasState();
  check(
    'canvas block from reply applied',
    !!updated && updated.title === 'Updated Doc' && updated.content.includes('new body')
  );
  const persistedSession = JSON.parse(mem.get(`or_session_${chat.chatStore.get().activeSession?.id}`) as string) as {
    canvas?: { title: string } | null;
    canvasWanted?: boolean;
  };
  check('canvas persisted on the session', persistedSession.canvasWanted === true && persistedSession.canvas?.title === 'Updated Doc');
  canvas.restoreCanvas(null, false);

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
