/**
 * API error type + the user-facing messages the legacy app showed as toasts.
 * Services throw; the UI decides how to present (toast vs inline).
 */

export class ApiError extends Error {
  /** Friendly, safe-to-show message (never leaks server internals). */
  readonly userMessage: string;
  readonly status: number | null;

  constructor(message: string, userMessage?: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.userMessage = userMessage ?? message;
    this.status = status;
  }
}

export const isAbortError = (e: unknown): boolean =>
  e instanceof Error && e.name === 'AbortError';

/** Status → user-facing toast text (ported verbatim from js/api.js). */
export const friendlyApiMessage = (status: number, detail: string): string => {
  if (status === 400) return detail || 'Invalid request. Check Settings.';
  if (status === 401) return 'Invalid OpenRouter API key. Check Settings.';
  if (status === 402) return detail || 'Insufficient credits on OpenRouter.';
  if (status === 403) return detail || 'Request blocked by OpenRouter.';
  if (status === 404) return detail || 'Model not found on OpenRouter.';
  if (status === 429) return 'Rate limited or too many requests.';
  if (status >= 500) return detail || 'OpenRouter server error.';
  return detail || `API Error: ${status}`;
};

export const apiErrorFromResponse = (status: number, detail: string): ApiError =>
  new ApiError(detail || `API returned ${status}`, friendlyApiMessage(status, detail), status);
