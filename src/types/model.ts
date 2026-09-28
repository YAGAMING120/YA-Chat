/** Model catalog entries (slim shape persisted in localStorage). */

export interface ModelCaps {
  /** Input modalities, e.g. ['text', 'image'] */
  in: string[];
  /** Output modalities, e.g. ['text'] or ['speech'] */
  out: string[];
  /** Supported sampling parameters */
  params: string[];
  ctx: number | null;
  maxOut: number | null;
}

export interface ModelEntry {
  id: string;
  name: string;
  owned_by: string;
  free: boolean;
  description: string;
  input: string[];
  output: string[];
  voices: string[];
  caps: ModelCaps;
}

/** Slim capability record used by canChat/canSpeak style predicates. */
export interface ModelCapability {
  id: string;
  name: string;
  input: string[];
  output: string[];
  params: string[];
  contextLength: number | null;
  maxCompletionTokens: number | null;
}

/** The subset of an OpenRouter /models entry we care about. */
export interface RawModel {
  id: string;
  name?: string;
  description?: string;
  owned_by?: string;
  context_length?: number;
  supported_parameters?: string[] | Record<string, unknown>;
  supported_voices?: string[];
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: { max_completion_tokens?: number };
}
