/**
 * Settings panel logic (API key, system prompt, temperature)
 */
import { saveToStorage, getFromStorage, clearStorage } from './storage.js';

const SETTINGS_KEY = 'openrouter_settings';
const DEFAULT_SETTINGS = {
    apiKey: '',
    systemPrompt: '',
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 4096,
    theme: 'system',
    thinkingEnabled: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

export const initSettings = () => {
    // Load from storage
    const stored = getFromStorage(SETTINGS_KEY, {});
    currentSettings = { ...DEFAULT_SETTINGS, ...stored };

    // DOM Elements
    const apiKeyInput = document.getElementById('settings-api-key');
    const systemPromptInput = document.getElementById('settings-system-prompt');
    const temperatureInput = document.getElementById('settings-temperature');
    const temperatureVal = document.getElementById('val-temperature');
    const topPInput = document.getElementById('settings-top-p');
    const topPVal = document.getElementById('val-top-p');
    const maxTokensInput = document.getElementById('settings-max-tokens');
    const btnClearData = document.getElementById('btn-clear-data');
    const themeButtons = document.querySelectorAll('.btn-theme');

    // Populate UI
    if (apiKeyInput) apiKeyInput.value = currentSettings.apiKey;
    if (systemPromptInput) systemPromptInput.value = currentSettings.systemPrompt;
    if (temperatureInput) {
        temperatureInput.value = currentSettings.temperature;
        temperatureVal.textContent = currentSettings.temperature;
    }
    if (topPInput) {
        topPInput.value = currentSettings.topP;
        topPVal.textContent = currentSettings.topP;
    }
    if (maxTokensInput) maxTokensInput.value = currentSettings.maxTokens;

    // Save helper
    const save = () => saveToStorage(SETTINGS_KEY, currentSettings);

    // Listeners
    apiKeyInput?.addEventListener('input', (e) => { currentSettings.apiKey = e.target.value.trim(); save(); });
    systemPromptInput?.addEventListener('input', (e) => { currentSettings.systemPrompt = e.target.value; save(); });
    
    temperatureInput?.addEventListener('input', (e) => { 
        currentSettings.temperature = parseFloat(e.target.value); 
        temperatureVal.textContent = currentSettings.temperature;
        save(); 
    });
    
    topPInput?.addEventListener('input', (e) => { 
        currentSettings.topP = parseFloat(e.target.value); 
        topPVal.textContent = currentSettings.topP;
        save(); 
    });
    
    maxTokensInput?.addEventListener('input', (e) => { 
        currentSettings.maxTokens = parseInt(e.target.value, 10) || 4096;
        save(); 
    });

    btnClearData?.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all data? This will delete your API key, settings, and all chat history. This cannot be undone.')) {
            clearStorage();
            location.reload();
        }
    });

    // Theme handling
    const applyTheme = (theme) => {
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        
        themeButtons.forEach(btn => {
            if (btn.dataset.theme === theme) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    };

    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            currentSettings.theme = theme;
            save();
            applyTheme(theme);
        });
    });

    // Initial theme apply
    applyTheme(currentSettings.theme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentSettings.theme === 'system') applyTheme('system');
    });

    console.log('Settings initialized');
};

export const getApiKey = () => currentSettings.apiKey;
export const getSettings = () => ({ ...currentSettings });
export const setThinkingEnabled = (val) => {
    currentSettings.thinkingEnabled = val;
    saveToStorage(SETTINGS_KEY, currentSettings);
};
