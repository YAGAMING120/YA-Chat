import type { CanvasDocument } from './canvas';
import type { ChatMessage } from './chat';

/** Lightweight entry stored in the sidebar session list. */
export interface SessionMeta {
  id: string;
  title: string;
  timestamp: number;
  projectId: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  projectId: string | null;
  /** Canvas panel content persisted alongside the chat. */
  canvas?: CanvasDocument | null;
  canvasWanted?: boolean;
}

export interface Project {
  id: string;
  name: string;
  systemPrompt: string;
  timestamp: number;
}
