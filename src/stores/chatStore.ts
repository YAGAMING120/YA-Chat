import type { ChatSession, Project, SessionMeta } from '../types/session';
import type { ChatMessage } from '../types/chat';
import {
  deleteSession as deleteStoredSession,
  getSession,
  getSessionList,
  saveSession
} from '../services/storage/sessions';
import {
  deleteProject as deleteStoredProject,
  getProjectList,
  saveProject
} from '../services/storage/projects';
import { createStore, useStore } from '../lib/store';
import { closeSidebar, focusComposer } from './uiStore';
import { registerCanvasPersister, restoreCanvas } from './canvasStore';

/**
 * Single source of truth for the conversation: active session, session list,
 * project filter, and the session/project CRUD actions.
 */
export interface ChatState {
  initialized: boolean;
  sessionList: SessionMeta[];
  projects: Project[];
  activeProjectId: string | null;
  activeSession: ChatSession | null;
}

export const chatStore = createStore<ChatState>({
  initialized: false,
  sessionList: [],
  projects: [],
  activeProjectId: null,
  activeSession: null
});

export const useChatState = (): ChatState => useStore(chatStore);

/* ── Session helpers ─────────────────────────────────────────────────── */

const refreshLists = (): void =>
  chatStore.set({
    sessionList: getSessionList(),
    projects: getProjectList()
  });

/** Boot the store: open the most recent chat, or start a fresh one. */
export const initChatStore = (): void => {
  const list = getSessionList();
  chatStore.set({ sessionList: list, projects: getProjectList(), initialized: true });

  const first = list[0];
  if (first) selectSession(first.id);
  else createNewChat();
};

/**
 * Start a blank chat. Like the legacy app, it is not written to storage until
 * the first message, so it never shows up in the sidebar as "New Chat".
 */
export const createNewChat = (): void => {
  const { activeProjectId } = chatStore.get();
  chatStore.set({
    activeSession: {
      id: Date.now().toString(),
      title: '',
      timestamp: Date.now(),
      messages: [],
      projectId: activeProjectId || null
    }
  });
  restoreCanvas(null, false);
  focusComposer();
};

export const selectSession = (id: string): void => {
  const session = getSession(id);
  if (session) {
    chatStore.set({ activeSession: session });
    restoreCanvas(session.canvas ?? null, session.canvasWanted === true);
    closeSidebar(); // close the drawer on mobile after selecting
  } else {
    createNewChat();
  }
};

export const deleteSessionById = (id: string): void => {
  deleteStoredSession(id);
  const { activeSession } = chatStore.get();
  refreshLists();
  if (activeSession && activeSession.id === id) createNewChat();
};

/** Apply an update to the active session (does not persist by itself). */
export const mutateActiveSession = (
  updater: (session: ChatSession) => ChatSession
): void => {
  const { activeSession } = chatStore.get();
  if (!activeSession) return;
  chatStore.set({ activeSession: updater(activeSession) });
};

/** Replace the whole active session (e.g. after loading from storage). */
export const setActiveSession = (session: ChatSession): void =>
  chatStore.set({ activeSession: session });

/**
 * Write the active session to localStorage and refresh the sidebar list.
 * Empty, never-sent chats are skipped so they don't create sidebar entries.
 */
export const persistActiveSession = (): void => {
  const { activeSession } = chatStore.get();
  if (!activeSession || activeSession.messages.length === 0) return;
  saveSession(activeSession);
  chatStore.set({ sessionList: getSessionList() });
};

/* ── Projects ────────────────────────────────────────────────────────── */

/** Toggle the sidebar project filter (does not touch the open chat). */
export const toggleProjectFilter = (id: string): void => {
  const { activeProjectId } = chatStore.get();
  chatStore.set({ activeProjectId: activeProjectId === id ? null : id });
};

export const createProject = (name: string, systemPrompt: string): void => {
  const project: Project = {
    id: Date.now().toString(),
    name,
    systemPrompt,
    timestamp: Date.now()
  };
  saveProject(project);
  chatStore.set({ activeProjectId: project.id, projects: getProjectList() });
};

export const deleteProjectById = (id: string): void => {
  deleteStoredProject(id);
  const { activeProjectId } = chatStore.get();
  refreshLists();
  if (activeProjectId === id) {
    chatStore.set({ activeProjectId: null });
    createNewChat();
  }
};

/* ── Messages (used by the send/streaming phases) ────────────────────── */

export const appendMessage = (message: ChatMessage): void =>
  mutateActiveSession((session) => ({
    ...session,
    messages: [...session.messages, message]
  }));

export const replaceMessages = (messages: ChatMessage[]): void =>
  mutateActiveSession((session) => ({ ...session, messages }));

/**
 * Legacy "Edit & resend": everything from this user message onward is dropped
 * and replaced by the edited text (the caller then requests a new reply).
 */
export const editUserMessage = (msgIndex: number, newText: string): void => {
  mutateActiveSession((session) => ({
    ...session,
    messages: [
      ...session.messages.slice(0, msgIndex),
      { role: 'user' as const, content: newText }
    ],
    timestamp: Date.now()
  }));
  persistActiveSession();
};

/**
 * Legacy Regenerate: remove the trailing assistant reply so the send pipeline
 * can request a fresh completion. Returns false when there is nothing to drop.
 */
export const dropLastAssistantMessage = (): boolean => {
  const messages = chatStore.get().activeSession?.messages;
  if (!messages || messages.length === 0) return false;
  if (messages[messages.length - 1]?.role !== 'assistant') return false;

  mutateActiveSession((session) => ({
    ...session,
    messages: session.messages.slice(0, -1)
  }));
  persistActiveSession();
  return true;
};

/* ── Canvas persistence (legacy `canvas-change` handler) ─────────────── */

registerCanvasPersister((canvas, wanted) => {
  const { activeSession } = chatStore.get();
  if (!activeSession) return;
  const next: ChatSession = { ...activeSession, canvas, canvasWanted: wanted };
  chatStore.set({ activeSession: next });
  // Never create a sidebar entry for a fresh, empty chat.
  if (!canvas && next.messages.length === 0) return;
  saveSession(next);
  chatStore.set({ sessionList: getSessionList() });
});
