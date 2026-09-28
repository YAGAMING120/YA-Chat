import { useEffect, useMemo } from 'react';
import { TOOL_DEFS, DEFAULT_IMAGE_MODEL } from '../../lib/tools';
import { setImageModel, setToolEnabled, useToolsState } from '../../stores/toolsStore';
import { closeTools } from '../../stores/uiStore';
import { getImageModels, useModelsState } from '../../stores/modelsStore';

/**
 * The composer's Tools popover — server-tool toggles plus the image-model
 * picker, persisted to `or_tools_v1`. Closes on outside click / Escape.
 */
export function ToolsPopover(): JSX.Element {
  const { enabled, imageModel } = useToolsState();
  const { models } = useModelsState();
  const imageModels = useMemo(() => getImageModels(), [models]);

  // Legacy: document click closes the popover (clicks inside are ignored).
  useEffect(() => {
    const onDocClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.tools-popover, #btn-tools')) return;
      closeTools();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const options: Array<{ value: string; label: string }> = [
    { value: '', label: `Auto (${DEFAULT_IMAGE_MODEL})` },
    ...imageModels.map((m) => ({
      value: m.id,
      label: `${m.free ? 'FREE · ' : ''}${m.name}`
    }))
  ];
  if (imageModel && !imageModels.some((m) => m.id === imageModel)) {
    options.unshift({ value: imageModel, label: imageModel });
  }

  return (
    <div className="tools-popover" id="tools-popover" onClick={(e) => e.stopPropagation()}>
      <div className="tools-popover__head">
        <span>Tools</span>
        <span className="tools-popover__hint">run server-side on each message</span>
      </div>
      <div className="tools-popover__list">
        {TOOL_DEFS.map((def) => (
          <label key={def.id} className="tool-row" data-tool={def.id}>
            <input
              type="checkbox"
              className="tool-row__check"
              checked={!!enabled[def.id]}
              onChange={(e) => setToolEnabled(def.id, e.target.checked)}
            />
            <span className="tool-row__icon" dangerouslySetInnerHTML={{ __html: def.icon }} />
            <span className="tool-row__text">
              <span className="tool-row__title">
                {def.label}
                <em className="tool-row__note">{def.note}</em>
              </span>
              <span className="tool-row__desc">{def.desc}</span>
            </span>
          </label>
        ))}
      </div>
      <div
        className="tool-row tool-row--sub"
        style={{ display: enabled.image_generation ? '' : 'none' }}
      >
        <span className="tool-row__icon" />
        <span className="tool-row__text">
          <span className="tool-row__title">Image model</span>
          <select
            id="tool-image-model"
            className="tool-row__select"
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </span>
      </div>
    </div>
  );
}
