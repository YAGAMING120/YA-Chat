import { Icon } from '../common/Icon';
import { exportSessionMarkdown } from '../../lib/download';
import { useChatState } from '../../stores/chatStore';
import { useModelsState } from '../../stores/modelsStore';
import { openModels, toggleSidebar } from '../../stores/uiStore';

export function Header(): JSX.Element {
  const { activeSession } = useChatState();
  const { models, selectedId } = useModelsState();
  const selected = models.find((m) => m.id === selectedId);
  const modelName = selected ? selected.name : selectedId;

  return (
    <header className="header">
      <div className="header__left">
          <button
            type="button"
            id="btn-sidebar-toggle"
            className="btn-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
          <Icon name="menu" />
        </button>

        <div
          id="btn-model-selector"
          className="model-selector"
          data-model-selector
          role="button"
          tabIndex={0}
          title="Select model"
          onClick={openModels}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openModels();
            }
          }}
        >
          <div className="indicator indicator--pulse" />
          <span className="model-selector__name" id="current-model-name">
            {modelName || 'Select model'}
          </span>
          <svg className="icon icon--sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      <div className="header__right">
          <button
            type="button"
            id="btn-export-chat"
            className="btn-icon"
            title="Export Chat Markdown"
            onClick={() => exportSessionMarkdown(activeSession)}
          >
          <Icon name="download" />
        </button>
      </div>
    </header>
  );
}
