/**
 * WYSIWYG HTML → markdown, ported from js/canvas.js (inlineMd / tableMd /
 * blockMd / htmlToMarkdown). Used when the contenteditable document editor
 * commits its buffer back into the canvas store.
 */

type DomNode = Node & {
  tagName?: string;
  getAttribute?: (n: string) => string | null;
  hasAttribute?: (n: string) => boolean;
};

const inlineMd = (node: DomNode | null | undefined): string => {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1) return '';

  const el = node as DomNode & { children?: HTMLCollection; childNodes: NodeListOf<ChildNode>; textContent: string };
  const tag = (el as HTMLElement).tagName;
  const kids = (): string => Array.from(el.childNodes).map((c) => inlineMd(c as DomNode)).join('');
  const wrap = (mark: string): string => {
    const t = kids().trim();
    return t ? mark + t + mark : '';
  };

  if (el.getAttribute && el.hasAttribute!('data-math')) {
    const expr = el.getAttribute!('data-math') || '';
    const display = el.getAttribute!('data-display') === '1';
    return display ? `\n\n$$${expr}$$\n\n` : `$${expr}$`;
  }

  switch (tag) {
    case 'STRONG':
    case 'B':
      return wrap('**');
    case 'EM':
    case 'I':
      return wrap('*');
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return wrap('~~');
    case 'CODE':
      return '`' + el.textContent + '`';
    case 'A': {
      const href = el.getAttribute?.('href') || '';
      const t = kids();
      return href ? `[${t}](${href})` : t;
    }
    case 'BR':
      return '\n';
    case 'IMG': {
      const src = el.getAttribute?.('src') || '';
      return src ? `![${el.getAttribute?.('alt') || ''}](${src})` : '';
    }
    case 'UL':
    case 'OL':
    case 'PRE':
    case 'BLOCKQUOTE':
    case 'TABLE':
      // Block-level element reached through inline traversal: keep raw text
      return el.textContent;
    default:
      return kids();
  }
};

const tableMd = (table: HTMLElement): string => {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((tr) =>
      Array.from(tr.children)
        .map((cell) => (cell.textContent || '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim())
        .filter(() => true)
    )
    .filter((r) => r.length > 0);
  if (rows.length === 0) return (table.textContent || '').trim();
  const head = rows[0]!;
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)
  ].join('\n');
};

const blockMd = (node: Node, out: string[]): void => {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 3) {
      const t = (child.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t, '');
      return;
    }
    if (child.nodeType !== 1) return;

    const el = child as HTMLElement;
    const tag = el.tagName;
    const heading = /^H[1-6]$/.test(tag);
    if (heading) {
      out.push('#'.repeat(Number(tag[1])) + ' ' + inlineMd(el as DomNode).trim());
      out.push('');
    } else if (tag === 'UL' || tag === 'OL') {
      Array.from(el.children)
        .filter((li) => li.tagName === 'LI')
        .forEach((li, i) => {
          const prefix = tag === 'OL' ? `${i + 1}. ` : '- ';
          const lines = inlineMd(li as unknown as DomNode).split('\n');
          lines.forEach((line, j) => out.push((j === 0 ? prefix : '   ') + line));
        });
      out.push('');
    } else if (tag === 'BLOCKQUOTE') {
      const inner: string[] = [];
      blockMd(el, inner);
      const text = inner.join('\n').replace(/\n+$/, '');
      text.split('\n').forEach((line) => out.push('> ' + line));
      out.push('');
    } else if (tag === 'PRE') {
      const codeEl = el.querySelector('code');
      const langMatch = (((codeEl && codeEl.className) || '') as string).match(/language-([\w+#-]+)/);
      out.push('```' + (langMatch ? langMatch[1] : ''));
      out.push(((codeEl || el).textContent || '').replace(/\n+$/, ''));
      out.push('```');
      out.push('');
    } else if (tag === 'TABLE') {
      out.push(tableMd(el));
      out.push('');
    } else if (tag === 'HR') {
      out.push('---');
      out.push('');
    } else if (tag === 'BR') {
      out.push('');
    } else if (el.querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table,div')) {
      blockMd(el, out);
    } else {
      const t = inlineMd(el as unknown as DomNode).trim();
      if (t)
        t.split('\n').forEach((line) => {
          if (line.trim()) out.push(line.trim(), '');
        });
    }
  });
};

export const htmlToMarkdown = (root: HTMLElement): string => {
  const out: string[] = [];
  blockMd(root, out);
  return out
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
