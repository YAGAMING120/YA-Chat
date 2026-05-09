/**
 * localStorage read/write for sessions and settings
 */

export const saveToStorage = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('Failed to save to localStorage', e);
    }
};

export const getFromStorage = (key, defaultValue = null) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error('Failed to parse from localStorage', e);
        return defaultValue;
    }
};

export const clearStorage = () => {
    try {
        localStorage.clear();
    } catch (e) {
        console.error('Failed to clear localStorage', e);
    }
};

// --- Session Management ---

export const getSessionList = () => {
    return getFromStorage('or_sessions_list', []);
};

export const saveSessionList = (list) => {
    saveToStorage('or_sessions_list', list);
};

export const getSession = (id) => {
    return getFromStorage(`or_session_${id}`);
};

export const saveSession = (session) => {
    try {
        localStorage.setItem(`or_session_${session.id}`, JSON.stringify(session));
        
        const list = getSessionList();
        const index = list.findIndex(s => s.id === session.id);
        const listItem = { id: session.id, title: session.title, timestamp: session.timestamp };
        
        if (index >= 0) {
            list[index] = listItem;
        } else {
            list.unshift(listItem);
        }
        saveSessionList(list);
    } catch (e) {
        console.error('Failed to save session', e);
    }
};

export const deleteSession = (id) => {
    try {
        localStorage.removeItem(`or_session_${id}`);
        let list = getSessionList();
        list = list.filter(s => s.id !== id);
        saveSessionList(list);
    } catch (e) {
        console.error('Failed to delete session', e);
    }
};
