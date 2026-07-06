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
        const sessionToSave = {
            ...session,
            messages: session.messages.map(msg => {
                if (Array.isArray(msg.content)) {
                    return {
                        ...msg,
                        content: msg.content.map(c => {
                            if (c.type === 'image_url' && c.image_url?.url?.startsWith('data:')) {
                                return { type: 'text', text: '[Attachment: ' + (c.image_url.url.includes('pdf') ? 'PDF Document' : 'Image') + ']' };
                            }
                            return c;
                        })
                    };
                }
                return msg;
            })
        };
        localStorage.setItem(`or_session_${session.id}`, JSON.stringify(sessionToSave));
        
        const list = getSessionList();
        const index = list.findIndex(s => s.id === session.id);
        const listItem = { id: session.id, title: session.title, timestamp: session.timestamp, projectId: session.projectId || null };
        
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

// --- Project Management ---

export const getProjectList = () => getFromStorage('or_projects', []);

export const saveProject = (project) => {
    const list = getProjectList();
    const idx = list.findIndex(p => p.id === project.id);
    if (idx >= 0) list[idx] = project;
    else list.unshift(project);
    saveToStorage('or_projects', list);
    saveToStorage(`or_project_${project.id}`, project);
};

export const getProject = (id) => getFromStorage(`or_project_${id}`);

export const deleteProject = (id) => {
    // Also delete all sessions belonging to this project
    const sessions = getSessionList().filter(s => s.projectId === id);
    sessions.forEach(s => deleteSession(s.id));
    // Remove project
    let list = getProjectList();
    list = list.filter(p => p.id !== id);
    saveToStorage('or_projects', list);
    localStorage.removeItem(`or_project_${id}`);
};
