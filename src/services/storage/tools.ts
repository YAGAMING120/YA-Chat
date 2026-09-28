import type { ToolState } from '../../types/tool';
import { getFromStorage, saveToStorage } from './local';

const TOOLS_KEY = 'or_tools_v1';

export const DEFAULT_TOOL_STATE: ToolState = {
  // Off by default: a request only gains a `tools` array once the user opts in.
  enabled: {},
  imageModel: ''
};

export const loadToolState = (): ToolState => {
  const stored = getFromStorage<Partial<ToolState> | null>(TOOLS_KEY, null);
  return {
    enabled: { ...(stored?.enabled ?? {}) },
    imageModel: stored?.imageModel || ''
  };
};

export const saveToolState = (state: ToolState): void =>
  saveToStorage(TOOLS_KEY, state);
