/** Token-usage reporting attached to (some) stream chunks. */
export interface Usage {
  total_tokens?: number;
  completion_tokens?: number;
  prompt_tokens?: number;
  server_tool_use?: {
    web_search_requests?: number;
  };
}

/**
 * Discriminated events emitted while reading an SSE chat stream.
 * `fullText` is the accumulated reply so far (not an incremental delta).
 */
export type StreamEvent =
  | { type: 'content'; fullText: string; usage: Usage | null }
  | { type: 'reasoning'; chunk: string }
  | { type: 'tool'; names: string[]; usage: Usage | null }
  | { type: 'annotations'; annotations: unknown[]; usage: Usage | null }
  | { type: 'usage'; usage: Usage };

export type StreamListener = (event: StreamEvent) => void;
