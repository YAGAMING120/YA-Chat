const PROMPTS = [
  'Explain SSE streaming in JavaScript',
  'Write a React component for a chat UI',
  'What is the difference between latency and throughput?',
  'Generate a markdown table of common CSS selectors'
];

export function EmptyState({
  onPickPrompt
}: {
  onPickPrompt?: (prompt: string) => void;
}): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">MD</div>
      <h2>How can I help you today?</h2>
      <div className="prompt-grid">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="prompt-card"
            onClick={() => onPickPrompt?.(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
