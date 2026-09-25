/**
 * Entry point, initializes everything
 */
import { initUI } from './ui.js';
import { initChat } from './chat.js';
import { initModels } from './models.js';
import { initSettings } from './settings.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('YA Chat OpenRouter Initializing...');
    initSettings();
    initModels();
    initChat();
    initUI();
});
