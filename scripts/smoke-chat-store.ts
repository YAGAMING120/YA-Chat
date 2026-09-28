/**
 * chatStore smoke test: session/project CRUD against an in-memory
 * localStorage stub (mirrors legacy js/chat.js flows). Run: npm run test:smoke
 */
export {};

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
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
  const store = await import('../src/stores/chatStore');
  const ui = await import('../src/stores/uiStore');
  const { chatStore } = store;

  console.log('chatStore: boot');
  store.initChatStore();
  let s = chatStore.get();
  check('init creates an active session', !!s.activeSession);
  check('init leaves session list empty', s.sessionList.length === 0);
  check('fresh chat has no messages', s.activeSession!.messages.length === 0);
  check('initialized flag set', s.initialized === true);

  console.log('chatStore: persistence');
  store.persistActiveSession();
  check('empty chat is not persisted', chatStore.get().sessionList.length === 0);

  store.appendMessage({ role: 'user', content: 'hello' });
  store.persistActiveSession();
  s = chatStore.get();
  check('chat with messages appears in list', s.sessionList.length === 1);
  const s1Id = s.activeSession!.id;

  console.log('chatStore: projects');
  store.createProject('Work', 'Be brief');
  s = chatStore.get();
  const projectId = s.projects[0]!.id;
  check('project created', s.projects.length === 1);
  check('creating a project selects it', s.activeProjectId === projectId);
  check(
    'open chat is left untouched (legacy parity)',
    s.activeSession!.id === s1Id && s.activeSession!.projectId === null
  );

  store.createNewChat();
  s = chatStore.get();
  const s2Id = s.activeSession!.id;
  check('new chat is scoped to the selected project', s.activeSession!.projectId === projectId);

  store.appendMessage({ role: 'user', content: 'project chat' });
  store.persistActiveSession();
  s = chatStore.get();
  check('both chats listed after persisting the project chat', s.sessionList.length === 2);

  console.log('chatStore: project filter toggle');
  check('filter starts on after createProject', chatStore.get().activeProjectId === projectId);
  store.toggleProjectFilter(projectId);
  check('project filter toggles off', chatStore.get().activeProjectId === null);
  store.toggleProjectFilter(projectId);
  check('project filter toggles on', chatStore.get().activeProjectId === projectId);
  store.toggleProjectFilter(projectId);
  check('project filter toggles off again', chatStore.get().activeProjectId === null);

  console.log('chatStore: switching sessions');
  store.selectSession(s1Id);
  check('selectSession loads persisted chat', chatStore.get().activeSession!.messages.length === 1);
  check(
    'selectSession keeps the unscoped chat unscoped',
    chatStore.get().activeSession!.projectId === null
  );

  console.log('chatStore: deletion');
  store.deleteSessionById(s1Id);
  s = chatStore.get();
  check('active chat removed from list', !s.sessionList.some((m) => m.id === s1Id));
  check('other chats survive', s.sessionList.length === 1 && s.sessionList[0]!.id === s2Id);
  check('deleting active chat starts a new chat', s.activeSession!.messages.length === 0);

  store.selectSession('missing');
  check('missing session falls back to a new chat', chatStore.get().activeSession!.messages.length === 0);

  store.toggleProjectFilter(projectId);
  store.deleteProjectById(projectId);
  s = chatStore.get();
  check('project deleted', s.projects.length === 0);
  check('active project filter cleared', s.activeProjectId === null);
  check('deleting the filtered project starts a new chat', s.activeSession!.messages.length === 0);

  console.log('chatStore: message actions');
  store.appendMessage({ role: 'user', content: 'first' });
  store.appendMessage({ role: 'assistant', content: 'answer one' });
  store.appendMessage({ role: 'user', content: 'second' });
  store.appendMessage({ role: 'assistant', content: 'answer two' });
  store.editUserMessage(2, 'second (edited)');
  s = chatStore.get();
  check(
    'edit truncates everything after the edited message',
    s.activeSession!.messages.map((m) => m.content).join('|') ===
      'first|answer one|second (edited)'
  );
  store.appendMessage({ role: 'assistant', content: 'answer three' });
  check('dropLastAssistantMessage removes the reply', store.dropLastAssistantMessage() === true);
  check(
    'last message is the edited user turn again',
    chatStore.get().activeSession!.messages.at(-1)!.content === 'second (edited)'
  );
  check('dropLastAssistantMessage refuses on a user turn', store.dropLastAssistantMessage() === false);

  console.log('uiStore: sidebar / overlays / focus / toasts');
  ui.openSidebar();
  check('sidebar opens', ui.uiStore.get().sidebarOpen === true);
  ui.openSettings();
  check('settings opens', ui.uiStore.get().settingsOpen === true);
  ui.closeAllOverlays();
  check(
    'overlays close',
    ui.uiStore.get().sidebarOpen === false && ui.uiStore.get().settingsOpen === false
  );
  const tick = ui.uiStore.get().composerFocusTick;
  ui.focusComposer();
  check('focus tick increments', ui.uiStore.get().composerFocusTick === tick + 1);
  ui.showToast('hello');
  ui.showToast('bad', 'error');
  check('toasts queued', ui.uiStore.get().toasts.length === 2);
  check('toast types preserved', ui.uiStore.get().toasts[1]!.type === 'error');

  console.log('sidebar CSS parity (legacy style/sidebar.css selectors)');
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const globalCss = readFileSync(join(process.cwd(), 'src', 'styles', 'global.css'), 'utf8');
  for (const sel of [
    '.sidebar__projects',
    '.sidebar__section-header',
    '.btn-new-project',
    '.project-empty',
    '.project-item',
    '.project-item--active',
    '.project-item__name',
    '.project-item__actions'
  ]) {
    check(`${sel} ported`, globalCss.includes(sel));
  }
  check(
    'project actions always visible on mobile',
    globalCss.includes('.project-item__actions { opacity: 1; }')
  );

  console.log('DOM id parity (legacy getElementById targets)');
  const srcFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(p);
    }
  };
  walk(join(process.cwd(), 'src'));
  const srcAll = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  const selectors = JSON.parse(
    readFileSync(
      join(process.cwd(), 'scripts', 'fixtures', 'legacy-dom-selectors.json'),
      'utf8'
    )
  ) as { ids: string[]; classes: string[] };
  const missingIds = selectors.ids.filter(
    (id) =>
      !srcAll.includes(`"${id}"`) && !srcAll.includes(`getElementById('${id}')`)
  );
  check(`all ${selectors.ids.length} legacy ids present in React`, missingIds.length === 0);
  if (missingIds.length > 0) console.log(`    missing: ${missingIds.join(', ')}`);

  const missingClasses = selectors.classes.filter((cls) => !srcAll.includes(cls));
  check(
    `all ${selectors.classes.length} legacy JS class selectors present in React`,
    missingClasses.length === 0
  );
  if (missingClasses.length > 0) console.log(`    missing: ${missingClasses.join(', ')}`);

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
