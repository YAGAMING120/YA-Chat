/** Core chat message shapes (mirrors the OpenAI/OpenRouter wire format). */

export type Role = 'system' | 'user' | 'assistant';

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export type ContentPart = TextContentPart | ImageContentPart;

/** User messages may be a plain string or a multipart array. */
export type MessageContent = string | ContentPart[];

/** Normalized citation rendered under an assistant reply (Sources list). */
export interface Source {
  url: string;
  title: string;
  host: string;
}

export interface ChatMessage {
  role: Role;
  content: MessageContent;
  /** Persisted on assistant messages when the reply carried citations. */
  annotations?: Source[];
  /** Live reasoning captured during the completion ("Thinking…" block). */
  reasoning?: string;
  /** Token usage line shown under a freshly completed reply. */
  meta?: string;
}

/** Extract the readable text of a message (multipart or plain). */
export function messageText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is TextContentPart => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

/** Extract image/PDF parts of a message for re-displaying attachments. */
export function messageImages(
  content: MessageContent
): Array<{ type: 'image' | 'pdf'; name: string; dataUrl: string }> {
  if (typeof content === 'string') return [];
  return content
    .filter((part): part is ImageContentPart => part.type === 'image_url')
    .map((part) => {
      const url = part.image_url.url;
      const isPdf = url.startsWith('data:application/pdf');
      return {
        type: isPdf ? ('pdf' as const) : ('image' as const),
        name: isPdf ? 'PDF Document' : 'image',
        dataUrl: url
      };
    });
}
