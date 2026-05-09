/**
 * Entry point, initializes everything
 */
import { initUI } from './ui.js';
import { initChat } from './chat.js';
import { initModels } from './models.js';
import { initSettings } from './settings.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('MentorDev OpenRouter Chat Initializing...');
    initSettings();
    initModels();
    initChat();
    initUI();
});
