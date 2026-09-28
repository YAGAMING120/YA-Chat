/** Canvas panel document + the `<canvas>` blocks the model emits. */

export type CanvasType = 'doc' | 'code';

export interface CanvasDocument {
  title: string;
  type: CanvasType;
  lang: string;
  content: string;
  updatedAt: number;
}

export type CanvasAction = 'replace' | 'append' | 'prepend';

/** Raw attributes parsed off a `<canvas ...>` block. */
export interface CanvasAttrs {
  title?: string;
  type?: string;
  lang?: string;
  language?: string;
  action?: string;
  [key: string]: string | undefined;
}

export interface CanvasBlock {
  attrs: CanvasAttrs;
  content: string;
}
