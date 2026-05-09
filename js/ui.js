/**
 * UI helpers (sidebar toggle, modals, toasts, theme toggle)
 */

/** Opens or closes the sidebar on mobile by toggling .open and the overlay */
export const closeSidebarMobile = () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
};

export const openSidebarMobile = () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.add('open');
    if (overlay) overlay.style.display = 'block';
};

export const initUI = () => {
    const btnSettingsOpen = document.getElementById('btn-settings-open');
    const modalSettings = document.getElementById('modal-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    const openSettings = () => {
        if (modalSettings) modalSettings.style.display = 'flex';
    };
    const closeSettings = () => {
        if (modalSettings) modalSettings.style.display = 'none';
    };

    btnSettingsOpen?.addEventListener('click', openSettings);
    btnCloseSettings?.addEventListener('click', closeSettings);

    // ── Mobile sidebar toggle ──────────────────────────────────────────────
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    btnSidebarToggle?.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar?.classList.contains('open')) {
            closeSidebarMobile();
        } else {
            openSidebarMobile();
        }
    });

    // Inject a sidebar overlay element into the DOM if not present
    if (!document.getElementById('sidebar-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.addEventListener('click', closeSidebarMobile);
        document.querySelector('.app-container')?.appendChild(overlay);
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
            }
        });
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSidebarMobile();
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.style.display = 'none';
            });
        }
        // Focus input shortcut: Ctrl+/ or Cmd+/
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            document.getElementById('chat-input')?.focus();
        }
        // New chat shortcut: Ctrl+Shift+N or Cmd+Shift+N
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            document.getElementById('btn-new-chat')?.click();
        }
    });

    console.log('UI initialized');
};

export const showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    let icon = '#icon-info';
    if (type === 'error') icon = '#icon-settings'; // Needs appropriate icon, use string or mapped symbol
    if (type === 'success') icon = '#icon-check';
    
    toast.innerHTML = `<div style="flex: 1;">${message}</div>`;
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
};
