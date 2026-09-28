/** File reading + classification for composer attachments (ported from js/chat.js). */

import type { Attachment, FileCategory } from '../types/attachment';

const FILE_TYPES: Record<FileCategory, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'],
  text: [
    'txt', 'md', 'markdown', 'csv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini',
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php',
    'swift', 'kt', 'lua', 'luau', 'sh', 'bash', 'zsh', 'html', 'css', 'scss', 'sass',
    'sql', 'graphql', 'env', 'gitignore', 'dockerfile', 'makefile', 'r', 'dart', 'vue', 'svelte'
  ],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'jar', 'war', 'ear', 'apk', 'ipa'],
  binary: ['exe', 'dll', 'so', 'bin', 'dat', 'db', 'sqlite', 'class', 'wasm'],
  doc: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'],
  unknown: []
};

/** Get category for a file by extension */
export const getFileCategory = (filename: string): FileCategory => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const categories = Object.keys(FILE_TYPES) as FileCategory[];
  for (const cat of categories) {
    if (FILE_TYPES[cat].includes(ext)) return cat;
  }
  return 'unknown';
};

const CATEGORY_ICONS: Record<FileCategory, string> = {
  image: '\u{1F5BC}\uFE0F',
  text: '\u{1F4C4}',
  archive: '\u{1F5DC}\uFE0F',
  binary: '\u2699\uFE0F',
  doc: '\u{1F4CB}',
  unknown: '\u{1F4CE}'
};

const EXT_ICONS: Record<string, string> = {
  csv: '\u{1F4CA}',
  json: '\u{1F4CB}',
  sql: '\u{1F5C4}\uFE0F',
  py: '\u{1F40D}',
  js: '\u{1F4DC}',
  html: '\u{1F310}',
  jar: '\u2615',
  zip: '\u{1F5DC}\uFE0F',
  apk: '\u{1F4F1}'
};

/** Get a friendly icon for a file category */
export const getFileIcon = (category: FileCategory, ext: string): string =>
  EXT_ICONS[ext] || CATEGORY_ICONS[category] || '\u{1F4CE}';

/** Format bytes to human readable */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Read a file and return a structured attachment object */
export const readFileAsAttachment = (file: File): Promise<Attachment> =>
  new Promise((resolve, reject) => {
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB limit
    if (file.size > MAX_SIZE) {
      reject(new Error('File too large. Maximum size is 10MB.'));
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const category = getFileCategory(file.name);
    const icon = getFileIcon(category, ext);
    const sizeStr = formatBytes(file.size);

    const base = {
      name: file.name,
      ext,
      category,
      icon,
      size: file.size,
      sizeStr,
      mimeType: file.type || 'application/octet-stream'
    };

    if (category === 'image') {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ ...base, type: 'image', dataUrl: String(e.target?.result ?? '') });
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    } else if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ ...base, type: 'pdf', base64: String(e.target?.result ?? '') });
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    } else if (category === 'text') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = String(e.target?.result ?? '');
        if (file.size > 500 * 1024) {
          resolve({
            ...base,
            type: 'text',
            content: raw.slice(0, 50000) + '\n\n[... file truncated at 50,000 chars ...]'
          });
        } else {
          resolve({ ...base, type: 'text', content: raw });
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsText(file);
    } else {
      resolve({ ...base, type: 'meta' });
    }
  });
