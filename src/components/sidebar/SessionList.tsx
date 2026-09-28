import { cn } from '../../lib/cn';
import { Icon } from '../common/Icon';
import { ConfirmButton } from '../common/InlineConfirm';
import { deleteSessionById, selectSession, useChatState } from '../../stores/chatStore';

export function SessionList(): JSX.Element {
  const { sessionList, projects, activeProjectId, activeSession } = useChatState();

  const visible = sessionList
    .filter((s) => (activeProjectId ? s.projectId === activeProjectId : !s.projectId))
    .sort((a, b) => b.timestamp - a.timestamp);

  const project = projects.find((p) => p.id === activeProjectId);
  const label = activeProjectId ? `${project?.name || 'Project'} Chats` : 'Recent Chats';

  return (
    <div id="session-list" className="sidebar__sessions">
      <div className="sidebar__sessions-title">{label}</div>
      {visible.map((session) => (
        <div
          key={session.id}
          className={cn(
            'session-item',
            activeSession?.id === session.id && 'session-item--active'
          )}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.btn-delete-session')) {
              selectSession(session.id);
            }
          }}
        >
          <span className="session-item__title">{session.title || 'New Chat'}</span>
          <div className="session-item__actions">
            <ConfirmButton
              title="Delete"
              className="btn-delete-session"
              message="Delete this chat?"
              onConfirm={() => deleteSessionById(session.id)}
            >
              <Icon name="trash" />
            </ConfirmButton>
          </div>
        </div>
      ))}
    </div>
  );
}
