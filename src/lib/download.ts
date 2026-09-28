import type { ChatSession } from '../types/session';

/**
 * Download a session as a Markdown file (verbatim port of the legacy
 * `btn-export-chat` handler in js/chat.js).
 */
export function exportSessionMarkdown(session: ChatSession | null): void {
  if (!session || session.messages.length === 0) return;

  let text = `# ${session.title}\n\n`;
  for (const m of session.messages) {
    text += `### ${m.role === 'user' ? 'User' : 'Assistant'}\n${m.content}\n\n---\n\n`;
  }

  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title || 'chat'}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
