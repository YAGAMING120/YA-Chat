/** Request/response shapes for the OpenRouter API surface we use. */

import type { ChatMessage } from '../../types/chat';
import type { Usage } from '../../types/stream';
import type { ToolSpec } from '../../types/tool';

export interface ChatCompletionPayload {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning?: { enabled: boolean };
  tools?: ToolSpec[];
  max_tool_calls?: number;
}

/** One SSE `data:` frame from /chat/completions. */
export interface StreamChunk {
  choices?: Array<{
    delta?: StreamDelta;
    message?: StreamDelta;
  }>;
  usage?: Usage;
  annotations?: unknown[];
  error?: { message?: string };
}

export interface StreamDelta {
  content?: string;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: Array<{ summary?: string; text?: string }>;
  tool_calls?: Array<{
    type?: string;
    function?: { name?: string };
  }>;
  annotations?: unknown[];
}

export interface ModelsResponse {
  data: unknown[];
}
