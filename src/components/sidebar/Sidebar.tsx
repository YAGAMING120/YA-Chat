import { Icon } from '../common/Icon';
import logoUrl from '../../../assets/ya-chat-logo.png';
import { createNewChat, useChatState } from '../../stores/chatStore';
import {
  closeSidebar,
  closeSidebarSearch,
  openSettings,
  openSidebarSearch,
  setSidebarSearch,
  toggleSidebar,
  useUiState
} from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import { ProjectList } from './ProjectList';
import { SessionList } from './SessionList';

const PANEL_ICON = (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </svg>
);

export function Sidebar(): JSX.Element {
  const { sidebarOpen, sidebarSearch } = useUiState();
  const { activeProjectId } = useChatState();
  const searching = sidebarSearch !== null;

  return (
    <>
      <aside className={cn('sidebar', sidebarOpen && 'open')}>
        <div className="sidebar__header">
          <div className="sidebar__brand">
            <img src={logoUrl} className="sidebar__logo" alt="" />
            <span className="sidebar__title">Blaze Chat</span>
          </div>
          <div className="sidebar__header-actions">
            <button
              type="button"
              id="btn-sidebar-search"
              className={cn('btn-icon', searching && 'btn-icon--active')}
              title="Search chats"
              aria-expanded={searching}
              onClick={() => (searching ? closeSidebarSearch() : openSidebarSearch())}
            >
              <Icon name="search" />
            </button>
            <button
              type="button"
              id="btn-sidebar-collapse"
              className="btn-icon"
              title="Hide sidebar"
              aria-label="Hide sidebar"
              onClick={toggleSidebar}
            >
              {PANEL_ICON}
            </button>
          </div>
        </div>

        {searching && (
          <div className="sidebar__search">
            <input
              id="sidebar-search-input"
              className="sidebar__search-input"
              type="text"
              placeholder="Search chats..."
              autoFocus
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSidebarSearch();
              }}
            />
          </div>
        )}

        <div className="sidebar__top">
          <button type="button" id="btn-new-chat" className="btn-new-chat" onClick={createNewChat}>
            <Icon name="plus" />
            New Chat
          </button>
        </div>

        <ProjectList />

        <SessionList />

        <div id="btn-settings-open" className="sidebar__bottom" onClick={openSettings}>
          <div className="user-profile">
            <img
              src={logoUrl}
              className="user-profile__avatar user-profile__avatar--logo"
              alt="Blaze Chat"
            />
            <div className="user-profile__info">
              <div className="user-profile__name">Blaze Chat</div>
              <div className="user-profile__status">
                {activeProjectId ? 'Project filter active' : 'API: Connected'}
              </div>
            </div>
            <Icon name="settings" />
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div id="sidebar-overlay" className="sidebar-overlay" onClick={closeSidebar} />
      )}
    </>
  );
}
