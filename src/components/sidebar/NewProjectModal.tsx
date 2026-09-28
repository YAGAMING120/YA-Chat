import { useEffect, useState } from 'react';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, systemPrompt: string) => void;
}

export function NewProjectModal({
  open,
  onClose,
  onCreate
}: NewProjectModalProps): JSX.Element | null {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, prompt.trim());
    setName('');
    setPrompt('');
  };

  return (
    <div
      id="new-project-modal"
      className="inline-project-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="inline-project-modal__box" onMouseDown={(e) => e.stopPropagation()}>
        <h3>New Project</h3>
        <input
          type="text"
          id="new-project-name"
          className="form-input"
          placeholder="Project name..."
          maxLength={40}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <textarea
          id="new-project-prompt"
          className="form-input form-textarea"
          rows={3}
          placeholder="Project system prompt (optional)…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="inline-project-modal__actions">
          <button type="button" id="btn-create-project" className="btn-edit-save" onClick={submit}>
            Create
          </button>
          <button type="button" id="btn-cancel-project" className="btn-edit-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
