import { Icon } from '../common/Icon';
import logoUrl from '../../../assets/ya-chat-logo.png';
import { createNewChat, useChatState } from '../../stores/chatStore';
import { closeSidebar, openSettings, useUiState } from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import { ProjectList } from './ProjectList';
import { SessionList } from './SessionList';

export function Sidebar(): JSX.Element {
  const { sidebarOpen } = useUiState();
  const { activeProjectId } = useChatState();

  return (
    <>
      <aside className={cn('sidebar', sidebarOpen && 'open')}>
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
              alt="YA Chat"
            />
            <div className="user-profile__info">
              <div className="user-profile__name">YA Chat</div>
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
