/** Files opened in the artifact side panel. */

export type ArtifactMode = 'code' | 'preview';

export interface Artifact {
  id: string;
  filename: string;
  /** Lowercase language id (html, javascript, tsx, …). */
  lang: string;
  code: string;
  mode: ArtifactMode;
}
