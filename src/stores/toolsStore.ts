/** Persisted server-tool toggles (`or_tools_v1`) + payload/chip helpers. */

import type { ToolState } from '../types/tool';
import { loadToolState, saveToolState } from '../services/storage/tools';
import { TOOL_DEFS, buildToolsPayload as buildPayload } from '../lib/tools';
import { createStore, useStore } from '../lib/store';

const initial = loadToolState();

export const toolsStore = createStore<ToolState>({
  enabled: initial.enabled,
  imageModel: initial.imageModel
});

export const useToolsState = (): ToolState => useStore(toolsStore);

const persist = (): void => {
  const { enabled, imageModel } = toolsStore.get();
  saveToolState({ enabled, imageModel });
};

export const setToolEnabled = (id: string, enabled: boolean): void => {
  toolsStore.set((s) => ({ enabled: { ...s.enabled, [id]: enabled } }));
  persist();
};

export const setImageModel = (imageModel: string): void => {
  toolsStore.set({ imageModel });
  persist();
};

export const isToolEnabled = (id: string): boolean => !!toolsStore.get().enabled[id];

export const getEnabledToolIds = (): string[] => {
  const { enabled } = toolsStore.get();
  return TOOL_DEFS.filter((t) => enabled[t.id]).map((t) => t.id);
};

/** `tools` + budget for the request — {} when nothing is switched on. */
export const buildToolsPayload = (): ReturnType<typeof buildPayload> =>
  buildPayload(toolsStore.get());
