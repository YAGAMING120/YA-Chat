/** Server-side tool definitions (executed by OpenRouter during a request). */

export interface ToolSpec {
  type: string;
  parameters?: Record<string, unknown>;
}

export interface ToolPayload {
  tools: ToolSpec[];
  max_tool_calls: number;
}

/** Persisted toggle state for the Tools popover (`or_tools_v1`). */
export interface ToolState {
  enabled: Record<string, boolean>;
  imageModel: string;
}

/** One entry in the tool registry. */
export interface ToolDef {
  id: string;
  type: string;
  label: string;
  desc: string;
  note: string;
  /** Live status line shown while the tool runs mid-stream. */
  chip: string;
  /** Inline SVG markup for the popover row. */
  icon: string;
  /** Build the wire-format spec (image_generation needs the picked model). */
  build: (imageModel?: string) => ToolSpec;
}
