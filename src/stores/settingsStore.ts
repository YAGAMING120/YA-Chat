import type { ThemeChoice, UserSettings } from '../types/settings';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings
} from '../services/storage/settings';
import { clearStorage } from '../services/storage/local';
import { createStore, useStore } from '../lib/store';

export interface SettingsState {
  loaded: boolean;
  settings: UserSettings;
}

export const settingsStore = createStore<SettingsState>({
  loaded: false,
  settings: DEFAULT_SETTINGS
});

export const useSettingsState = (): SettingsState => useStore(settingsStore);

/* ── Theme ───────────────────────────────────────────────────────────── */

/** Resolve a theme choice onto the document (system follows OS preference). */
export const applyTheme = (theme: ThemeChoice): void => {
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
};

let systemListenerAttached = false;

/** Load persisted settings (with legacy migration) and apply the theme. */
export const initSettings = (): void => {
  const settings = loadSettings();
  settingsStore.set({ settings, loaded: true });
  applyTheme(settings.theme);

  if (!systemListenerAttached) {
    systemListenerAttached = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settingsStore.get().settings.theme === 'system') applyTheme('system');
    });
  }
};

/* ── Mutations (each one persists) ───────────────────────────────────── */

const update = (patch: Partial<UserSettings>): void => {
  const settings = { ...settingsStore.get().settings, ...patch };
  settingsStore.set({ settings });
  saveSettings(settings);
};

export const setApiKey = (apiKey: string): void => update({ apiKey: apiKey.trim() });
export const setSystemPrompt = (systemPrompt: string): void => update({ systemPrompt });
export const setTemperature = (temperature: number): void => update({ temperature });
export const setTopP = (topP: number): void => update({ topP });
export const setMaxTokens = (maxTokens: number): void =>
  update({ maxTokens: maxTokens || 4096 });
export const setThinkingEnabled = (thinkingEnabled: boolean): void =>
  update({ thinkingEnabled });

export const setTheme = (theme: ThemeChoice): void => {
  update({ theme });
  applyTheme(theme);
};

/* ── Read helpers used by the send/streaming phases ──────────────────── */

export const getSettings = (): UserSettings => ({ ...settingsStore.get().settings });
export const getApiKey = (): string => settingsStore.get().settings.apiKey;

/* ── Danger zone ─────────────────────────────────────────────────────── */

/** Wipe every localStorage key (keys, settings, chats) and reload. */
export const clearAllData = (): void => {
  if (
    !window.confirm(
      'Are you sure you want to clear all data? This will delete your API key, settings, and all chat history. This cannot be undone.'
    )
  ) {
    return;
  }
  clearStorage();
  window.location.reload();
};
