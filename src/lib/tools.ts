/**
 * Server tools — OpenRouter executes them server-side during a single request,
 * so the browser never runs an agent loop of its own.
 * Docs: https://openrouter.ai/docs/guides/features/server-tools
 * Ported from js/tools.js.
 */

import type { ToolDef, ToolPayload, ToolState } from '../types/tool';

const svg = (paths: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

const ICONS = {
  search: svg('<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>'),
  clock: svg('<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>'),
  link: svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>'
  ),
  image: svg(
    '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>'
  )
};

export const DEFAULT_IMAGE_MODEL = 'openai/gpt-5-image';

/** Which tools exist, how they're wired into the request, and how they're labelled */
export const TOOL_DEFS: ToolDef[] = [
  {
    id: 'web_search',
    type: 'openrouter:web_search',
    label: 'Web search',
    desc: 'Grounds the answer in live results and cites them',
    note: 'Billed per search',
    chip: 'Searching the web…',
    icon: ICONS.search,
    build: () => ({
      type: 'openrouter:web_search',
      parameters: { max_results: 5, max_uses: 3 }
    })
  },
  {
    id: 'datetime',
    type: 'openrouter:datetime',
    label: 'Date & time',
    desc: 'Keeps the model aware of today\u2019s date and time',
    note: 'Free',
    chip: 'Checking the date…',
    icon: ICONS.clock,
    build: () => ({ type: 'openrouter:datetime' })
  },
  {
    id: 'web_fetch',
    type: 'openrouter:web_fetch',
    label: 'Read a URL',
    desc: 'Opens links and PDFs you paste, then answers about them',
    note: 'Free',
    chip: 'Reading page…',
    icon: ICONS.link,
    build: () => ({
      type: 'openrouter:web_fetch',
      parameters: { engine: 'openrouter', max_uses: 5 }
    })
  },
  {
    id: 'image_generation',
    type: 'openrouter:image_generation',
    label: 'Image generation',
    desc: 'Draws images straight into the conversation',
    note: 'Per-image cost',
    chip: 'Generating image…',
    icon: ICONS.image,
    build: (imageModel?: string) => {
      const parameters: Record<string, unknown> = {};
      if (imageModel) parameters.model = imageModel;
      return { type: 'openrouter:image_generation', parameters };
    }
  }
];

/** `tools` + budget to add to a chat payload — {} when nothing is switched on */
export const buildToolsPayload = (state: ToolState): ToolPayload | Record<string, never> => {
  const tools = TOOL_DEFS.filter((t) => state.enabled[t.id]).map((t) => t.build(state.imageModel));
  if (tools.length === 0) return {};
  return { tools, max_tool_calls: 8 };
};

/** Live status line shown while a server tool is running mid-stream */
export const getToolChipLabel = (name?: string | null): string | null => {
  if (!name) return null;
  const key = String(name).replace(/^openrouter:/, '');
  const def = TOOL_DEFS.find((t) => t.id === key || t.type === name);
  return def ? def.chip : null;
};
