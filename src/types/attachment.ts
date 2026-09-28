/** Files the user attaches from the composer. */

export type FileCategory = 'image' | 'text' | 'archive' | 'binary' | 'doc' | 'unknown';

export interface AttachmentBase {
  name: string;
  ext: string;
  category: FileCategory;
  icon: string;
  size: number;
  sizeStr: string;
  mimeType: string;
}

export interface ImageAttachment extends AttachmentBase {
  type: 'image';
  dataUrl: string;
}

export interface PdfAttachment extends AttachmentBase {
  type: 'pdf';
  /** data: URL of the PDF, sent as an image_url part. */
  base64: string;
}

export interface TextAttachment extends AttachmentBase {
  type: 'text';
  content: string;
}

/** Binary/archive files: only acknowledged by name, never parsed. */
export interface MetaAttachment extends AttachmentBase {
  type: 'meta';
}

export type Attachment = ImageAttachment | PdfAttachment | TextAttachment | MetaAttachment;
