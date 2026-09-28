import type { ThemeChoice, UserSettings } from '../../types/settings';
import { getFromStorage, saveToStorage, removeStorage } from './local';

export const SETTINGS_KEY = 'or_settings';
const LEGACY_SETTINGS_KEY = 'opencode_zen_settings';

export const DEFAULT_SETTINGS: UserSettings = {
  apiKey: '',
  systemPrompt: '',
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 4096,
  theme: 'system',
  thinkingEnabled: false
};

/**
 * Load settings, migrating the legacy `opencode_zen_settings` blob if present.
 * The old provider's API key is deliberately never carried over — it would be
 * invalid on OpenRouter.
 */
export const loadSettings = (): UserSettings => {
  let stored = getFromStorage<Partial<UserSettings> | null>(SETTINGS_KEY, null);

  if (!stored) {
    const legacy = getFromStorage<Record<string, unknown> | null>(LEGACY_SETTINGS_KEY, null);
    if (legacy) {
      stored = { ...(legacy as Partial<UserSettings>), apiKey: '' };
      removeStorage(LEGACY_SETTINGS_KEY);
    }
  }

  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
};

export const saveSettings = (settings: UserSettings): void =>
  saveToStorage(SETTINGS_KEY, settings);

export const isThemeChoice = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'dark' || value === 'light';
