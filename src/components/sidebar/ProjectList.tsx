import { useState } from 'react';
import { cn } from '../../lib/cn';
import { Icon } from '../common/Icon';
import { ConfirmButton } from '../common/InlineConfirm';
import {
  createProject,
  deleteProjectById,
  toggleProjectFilter,
  useChatState
} from '../../stores/chatStore';
import { NewProjectModal } from './NewProjectModal';

export function ProjectList(): JSX.Element {
  const { projects, activeProjectId } = useChatState();
  const [creating, setCreating] = useState(false);

  return (
    <div className="sidebar__projects">
      <div className="sidebar__section-header">
        <span>Projects</span>
        <button
          type="button"
          id="btn-new-project"
          className="btn-new-project"
          title="New Project"
          onClick={() => setCreating(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div id="project-list">
        {projects.length === 0 ? (
          <div className="project-empty">No projects yet</div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={cn('project-item', activeProjectId === project.id && 'project-item--active')}
              onClick={() => toggleProjectFilter(project.id)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="14"
                height="14"
                className="shrink-0"
              >
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              <span className="project-item__name">{project.name}</span>
              <div className="project-item__actions">
                <ConfirmButton
                  title="Delete project"
                  className="btn-delete-project"
                  message={`Delete "${project.name}" and all its chats?`}
                  onConfirm={() => deleteProjectById(project.id)}
                >
                  <Icon name="trash" />
                </ConfirmButton>
              </div>
            </div>
          ))
        )}
      </div>

      <NewProjectModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(name, systemPrompt) => {
          createProject(name, systemPrompt);
          setCreating(false);
        }}
      />
    </div>
  );
}
