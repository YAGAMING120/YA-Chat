import { useEffect, useMemo, useRef, useState } from 'react';
import { closeModels, openTts, showToast, useUiState } from '../../stores/uiStore';
import {
  getModelEntry,
  selectModel,
  useModelsState
} from '../../stores/modelsStore';
import { canChat, getMeta } from '../../lib/capabilities';
import { cn } from '../../lib/cn';
import type { ModelEntry } from '../../types/model';

type Filter = 'all' | 'free' | 'chat' | 'voice';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All Models' },
  { value: 'free', label: 'Free API Only' },
  { value: 'chat', label: 'Chat' },
  { value: 'voice', label: 'Voice (TTS)' }
];

const matchesFilter = (m: ModelEntry, filter: Filter, canSelect: boolean): boolean => {
  if (filter === 'free') return m.free;
  if (filter === 'chat') return canSelect;
  if (filter === 'voice') return m.output.includes('speech') || m.output.includes('audio');
  return true;
};

/** FREE / TTS / EMBED / … badges — port of badgeFor() in js/models.js. */
function Badges({ model }: { model: ModelEntry }): JSX.Element {
  return (
    <span className="model-item__badges">
      {model.free && <span className="badge-free">FREE</span>}
      {model.output.includes('speech') && <span className="badge-type badge-type--voice">TTS</span>}
      {model.output.includes('embeddings') && <span className="badge-type badge-type--embed">EMBED</span>}
      {model.output.includes('rerank') && <span className="badge-type badge-type--rerank">RERANK</span>}
      {model.output.includes('decisions') && (
        <span className="badge-type badge-type--decision">DECISION</span>
      )}
      {model.output.includes('image') && <span className="badge-type badge-type--image">IMAGE</span>}
      {(model.input.includes('image') || model.input.includes('audio') || model.input.includes('video')) && (
        <span className="badge-type badge-type--vision">MULTIMODAL</span>
      )}
    </span>
  );
}

/** Model picker modal — port of setupModelsUI/renderModelsList in js/models.js. */
export function ModelsModal(): JSX.Element | null {
  const { modelsOpen } = useUiState();
  const { models, catalog, selectedId } = useModelsState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Open: focus the search; close: clear it (legacy behaviour)
  useEffect(() => {
    if (modelsOpen) {
      setQuery('');
      setFilter('all');
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setQuery('');
    return;
  }, [modelsOpen]);

  const canSelect = (m: ModelEntry): boolean => canChat(getMeta(catalog, m.id));

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return models.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.owned_by || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q);
      return matchesSearch && matchesFilter(m, filter, canSelect(m));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [models, query, filter, catalog]);

  if (!modelsOpen) return null;

  const handleModelClick = (id: string): void => {
    const entry = getModelEntry(id);
    if (!entry) return;

    if (canSelect(entry)) {
      selectModel(id);
      closeModels();
      return;
    }

    // Speech models drive the TTS modal, everything else is not selectable
    if (entry.output.includes('speech') || entry.output.includes('audio')) {
      closeModels();
      openTts('', id);
      return;
    }

    showToast(
      `${entry.name} can't reply in chat — it's a ${entry.output.join('/')} model, not a text model.`,
      'error'
    );
  };

  return (
    <div
      className="modal-overlay"
      id="modal-models"
      style={{ display: 'flex' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModels();
      }}
    >
      <div className="modal" id="models-modal-content" style={{ maxHeight: '80vh' }}>
        <div className="modal__header">
          <h2 className="modal__title">Select Model</h2>
          <button type="button" className="btn-icon btn-close-modal" id="btn-close-models" onClick={closeModels}>
            <svg className="icon">
              <use href="#icon-plus" style={{ transform: 'rotate(45deg)' }} />
            </svg>
          </button>
        </div>
        <div className="modal__body" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div
            className="model-search-container"
            style={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'var(--bg-surface)',
              padding: '1.5rem 0 1rem',
              zIndex: 2,
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            <div style={{ position: 'relative' }}>
              <svg
                className="icon"
                style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dim)'
                }}
                aria-hidden="true"
              >
                <use href="#icon-search" />
              </svg>
              <input
                type="text"
                id="input-search-models"
                ref={searchRef}
                className="form-input"
                style={{ width: '100%', paddingLeft: '2.5rem' }}
                placeholder="Search models by name or ID..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={cn('btn-filter', filter === f.value && 'active')}
                  data-filter={f.value}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="models-list" id="models-list-container" style={{ padding: '1rem 0', overflowY: 'auto' }}>
            {models.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
                Loading models... Make sure your API key is set.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                No models found matching criteria.
              </div>
            ) : (
              filtered.map((m) => {
                const selectable = canSelect(m);
                const isSpeech = m.output.includes('speech') || m.output.includes('audio');
                const blocked = !selectable && !isSpeech;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'model-item',
                      m.id === selectedId && 'selected',
                      blocked && 'model-item--blocked'
                    )}
                    data-id={m.id}
                    title={
                      blocked
                        ? 'This model cannot reply in chat — embeddings, rerank and decisions models are not chat models.'
                        : undefined
                    }
                    onClick={() => handleModelClick(m.id)}
                  >
                    <div className="model-item__header">
                      <span className="model-item__title">{m.name}</span>
                      <Badges model={m} />
                    </div>
                    <div className="model-item__desc">{m.id}</div>
                    {m.description && <div className="model-item__summary">{m.description}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
