import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import { renderMarkdown, renderMarkdownPlain } from '../../lib/markdown/render';

interface MarkdownProps {
  content: string;
  /** Strip code-block action buttons (used by the Canvas editor). */
  plain?: boolean;
  className?: string;
  onOpenArtifact?: (code: string, lang: string) => void;
  onOpenCanvasChip?: (payload: unknown) => void;
}

export function Markdown({
  content,
  plain = false,
  className = 'chat__content',
  onOpenArtifact,
  onOpenCanvasChip
}: MarkdownProps): JSX.Element {
  const html = useMemo(
    () => (plain ? renderMarkdownPlain(content) : renderMarkdown(content)),
    [content, plain]
  );

  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;

    const copyCode = target.closest<HTMLElement>('.btn-copy-code');
    if (copyCode) {
      const raw = copyCode.dataset.code;
      if (raw) {
        void navigator.clipboard.writeText(decodeURIComponent(raw));
        copyCode.textContent = 'Copied!';
        setTimeout(() => {
          copyCode.textContent = 'Copy';
        }, 2000);
      }
      return;
    }

    const openArtifact = target.closest<HTMLElement>('.btn-open-artifact');
    if (openArtifact) {
      onOpenArtifact?.(
        decodeURIComponent(openArtifact.dataset.code ?? ''),
        openArtifact.dataset.lang || 'text'
      );
      return;
    }

    const chip = target.closest<HTMLElement>('.canvas-chip');
    if (chip) {
      try {
        onOpenCanvasChip?.(JSON.parse(decodeURIComponent(chip.dataset.canvas ?? '')));
      } catch {
        /* malformed chip — ignore */
      }
    }
  };

  return <div className={className} onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
