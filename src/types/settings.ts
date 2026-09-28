/** User-editable settings persisted in localStorage (`or_settings`). */

export type ThemeChoice = 'system' | 'dark' | 'light';

export interface UserSettings {
  /** BYOK: the user's own OpenRouter key. Empty = not configured. */
  apiKey: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  theme: ThemeChoice;
  thinkingEnabled: boolean;
}
