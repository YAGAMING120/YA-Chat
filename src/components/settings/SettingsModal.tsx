import { Modal } from '../common/Modal';
import type { ThemeChoice } from '../../types/settings';
import {
  clearAllData,
  setApiKey,
  setMaxTokens,
  setSystemPrompt,
  setTemperature,
  setTheme,
  setTopP,
  useSettingsState
} from '../../stores/settingsStore';

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' }
];

export function SettingsModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { settings } = useSettingsState();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      closeId="btn-close-settings"
      overlayId="modal-settings"
    >
      <div className="form-group">
        <label htmlFor="settings-api-key" className="form-label">
          OpenRouter API Key
        </label>
        <input
          type="password"
          id="settings-api-key"
          placeholder="sk-or-v1-..."
          className="form-input"
          value={settings.apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <div className="form-hint">
          Stored locally in your browser. Get a key at{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
            openrouter.ai/keys
          </a>
          .
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="settings-system-prompt" className="form-label">
          Default System Prompt
        </label>
        <textarea
          id="settings-system-prompt"
          className="form-input form-textarea"
          rows={3}
          placeholder="You are a helpful AI assistant."
          value={settings.systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="settings-temperature" className="form-label">
          Temperature: <span id="val-temperature">{settings.temperature}</span>
        </label>
        <input
          type="range"
          id="settings-temperature"
          min={0}
          max={2}
          step={0.1}
          className="form-slider"
          value={settings.temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label htmlFor="settings-top-p" className="form-label">
          Top-P: <span id="val-top-p">{settings.topP}</span>
        </label>
        <input
          type="range"
          id="settings-top-p"
          min={0}
          max={1}
          step={0.05}
          className="form-slider"
          value={settings.topP}
          onChange={(e) => setTopP(parseFloat(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label htmlFor="settings-max-tokens" className="form-label">
          Max Tokens
        </label>
        <input
          type="number"
          id="settings-max-tokens"
          min={128}
          max={32768}
          className="form-input"
          value={settings.maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 4096)}
        />
      </div>

      <div className="form-group form-group--inline">
        <label className="form-label">Theme</label>
        <div className="theme-toggle">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={settings.theme === t.value ? 'btn-theme active' : 'btn-theme'}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="modal__danger-zone">
        <button type="button" id="btn-clear-data" className="btn-danger" onClick={clearAllData}>
          Clear All Data
        </button>
      </div>
    </Modal>
  );
}
