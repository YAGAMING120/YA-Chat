import type { ChatSession, SessionMeta } from '../../types/session';
import { getFromStorage, saveToStorage, removeStorage } from './local';

const SESSION_LIST_KEY = 'or_sessions_list';
const sessionKey = (id: string) => `or_session_${id}`;

export const getSessionList = (): SessionMeta[] =>
  getFromStorage<SessionMeta[]>(SESSION_LIST_KEY, []);

export const saveSessionList = (list: SessionMeta[]): void =>
  saveToStorage(SESSION_LIST_KEY, list);

export const getSession = (id: string): ChatSession | null =>
  getFromStorage<ChatSession>(sessionKey(id));

/**
 * Persist a session. Inline data: URLs are replaced with a placeholder so
 * multi-MB image payloads never bloat localStorage (legacy behaviour).
 */
export const saveSession = (session: ChatSession): void => {
  try {
    const sessionToSave: ChatSession = {
      ...session,
      messages: session.messages.map((msg) => {
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part) => {
              if (part.type === 'image_url' && part.image_url.url.startsWith('data:')) {
                return {
                  type: 'text' as const,
                  text:
                    '[Attachment: ' +
                    (part.image_url.url.includes('pdf') ? 'PDF Document' : 'Image') +
                    ']'
                };
              }
              return part;
            })
          };
        }
        return msg;
      })
    };
    localStorage.setItem(sessionKey(session.id), JSON.stringify(sessionToSave));

    const list = getSessionList();
    const index = list.findIndex((s) => s.id === session.id);
    const listItem: SessionMeta = {
      id: session.id,
      title: session.title,
      timestamp: session.timestamp,
      projectId: session.projectId || null
    };

    if (index >= 0) {
      list[index] = listItem;
    } else {
      list.unshift(listItem);
    }
    saveSessionList(list);
  } catch (e) {
    console.error('Failed to save session', e);
  }
};

export const deleteSession = (id: string): void => {
  try {
    removeStorage(sessionKey(id));
    saveSessionList(getSessionList().filter((s) => s.id !== id));
  } catch (e) {
    console.error('Failed to delete session', e);
  }
};
