/**
 * Send pipeline: user message → OpenRouter SSE completion → persisted reply.
 * Port of handleSend/triggerCompletion from js/chat.js.
 */

import type { ChatMessage, ContentPart, MessageContent, Source } from '../types/chat';
import type { Attachment } from '../types/attachment';
import type { StreamEvent, Usage } from '../types/stream';
import type { ChatCompletionPayload } from '../services/openrouter/types';
import { streamChatCompletion } from '../services/openrouter/chat';
import { ApiError, isAbortError } from '../services/openrouter/errors';
import { getProject } from '../services/storage/projects';
import { normalizeSources } from '../lib/markdown/sources';
import { parseCanvasBlocks } from '../lib/markdown/canvasBlocks';
import { canChat } from '../lib/capabilities';
import { chatStore, mutateActiveSession, persistActiveSession } from './chatStore';
import {
  CANVAS_INSTRUCTION,
  applyCanvasBlock,
  buildCanvasContext,
  isCanvasWanted
} from './canvasStore';
import { getApiKey, getSettings } from './settingsStore';
import { getSelectedMeta, getSelectedModelId } from './modelsStore';
import { openModels, showToast } from './uiStore';
import { clearComposer } from './composerStore';
import { beginStream, endStream, failStream, patchStream } from './streamStore';
import { buildToolsPayload } from './toolsStore';
import { getToolChipLabel } from '../lib/tools';

let abortController: AbortController | null = null;

/** True while a completion request is in flight. */
export const isStreaming = (): boolean => abortController !== null;

/** Abort the in-flight completion (the send button becomes the stop button). */
export const stopStreaming = (): void => {
  abortController?.abort();
};

/** Build API content — multipart if attachments, else plain string. */
const buildApiContent = (text: string, attachments: Attachment[]): MessageContent => {
  if (attachments.length === 0) return text;

  const parts: ContentPart[] = [];
  attachments.forEach((att) => {
    if (att.type === 'image') {
      parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    } else if (att.type === 'pdf') {
      parts.push({ type: 'image_url', image_url: { url: att.base64 } });
    } else if (att.type === 'text') {
      parts.push({
        type: 'text',
        text: `[File: ${att.name} | ${att.sizeStr} | ${att.ext.toUpperCase()}]\n\`\`\`${att.ext}\n${att.content}\n\`\`\``
      });
    } else {
      parts.push({
        type: 'text',
        text: `[Attached file: ${att.name} | ${att.sizeStr} | Type: ${att.ext.toUpperCase()} | Note: Binary/archive files cannot be read, only acknowledged]`
      });
    }
  });
  if (text) parts.push({ type: 'text', text });
  return parts;
};

/** `"1234 tokens • 2 web searches"` — the meta line under a fresh reply. */
const usageToMeta = (usage: Usage): string => {
  const parts = [`${usage.total_tokens || '?'} tokens`];
  const searches = usage.server_tool_use?.web_search_requests;
  if (searches) parts.push(`${searches} web search${searches === 1 ? '' : 'es'}`);
  return parts.join(' • ');
};

/**
 * Append the user message (multipart when attachments are present), give the
 * chat its title, persist, then request the completion.
 */
export const sendMessage = async (text: string, attachments: Attachment[]): Promise<void> => {
  const content = text.trim();
  if (!content && attachments.length === 0) return;
  if (abortController) return;

  // Guard: embeddings/rerank/decisions/speech models can't produce a reply
  const meta = getSelectedMeta();
  if (meta && !canChat(meta)) {
    showToast(`${meta.name} can't reply in chat — pick a text model instead.`, 'error');
    openModels();
    return;
  }

  clearComposer();

  mutateActiveSession((session) => ({
    ...session,
    messages: [...session.messages, { role: 'user', content: buildApiContent(content, attachments) }],
    title: session.title || (content || attachments[0]?.name || 'Chat').substring(0, 30),
    timestamp: Date.now()
  }));
  persistActiveSession();

  await triggerCompletion();
};

/**
 * Run a completion for the current session (used after a send, edit & resend,
 * or regenerate). Renders progress into the stream store, then persists the
 * finished assistant message.
 */
export const triggerCompletion = async (): Promise<void> => {
  if (abortController) return;
  const session = chatStore.get().activeSession;
  if (!session) return;

  beginStream();
  const controller = new AbortController();
  abortController = controller;

  const settings = getSettings();
  const payload: ChatCompletionPayload = {
    model: getSelectedModelId(),
    messages: [...session.messages],
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    top_p: settings.topP,
    stream: true
  };

  // Only request extended reasoning when user has it enabled
  if (settings.thinkingEnabled) payload.reasoning = { enabled: true };

  // Server tools the user switched on in the Tools popover
  Object.assign(payload, buildToolsPayload());

  const systemParts: string[] = [];
  if (session.projectId) systemParts.push(getProject(session.projectId)?.systemPrompt || '');
  if (settings.systemPrompt) systemParts.push(settings.systemPrompt);
  if (isCanvasWanted()) {
    systemParts.push(CANVAS_INSTRUCTION);
    systemParts.push(buildCanvasContext());
  }
  const combined = systemParts.filter(Boolean).join('\n\n');
  if (combined) payload.messages.unshift({ role: 'system', content: combined });

  let streamedContent = '';
  let reasoningContent = '';
  let sources: Source[] = [];
  let usage: Usage | null = null;
  let started = false;
  let toolLabel: string | null = null;
  let rafPending = false;

  const flush = (): void => {
    rafPending = false;
    patchStream({
      content: streamedContent,
      reasoning: reasoningContent,
      started,
      sources,
      usage,
      toolLabel
    });
  };

  /** One store update per animation frame — at most ~60fps (legacy parity). */
  const schedule = (): void => {
    if (rafPending) return;
    rafPending = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else flush();
  };

  const onEvent = (event: StreamEvent): void => {
    if (event.type === 'content') {
      streamedContent = event.fullText;
      started = true;
      if (event.usage) usage = event.usage;
    } else if (event.type === 'reasoning') {
      reasoningContent += event.chunk;
    } else if (event.type === 'annotations') {
      sources = normalizeSources(event.annotations);
    } else if (event.type === 'tool') {
      const label = event.names.map((n) => getToolChipLabel(n)).find(Boolean) ?? null;
      if (label) toolLabel = label;
      if (event.usage) usage = event.usage;
    } else if (event.type === 'usage') {
      usage = event.usage;
    }
    schedule();
  };

  try {
    const response = await streamChatCompletion(
      payload,
      onEvent,
      controller.signal,
      getApiKey() || undefined
    );
    if (response) streamedContent = response;

    const assistantMsg: ChatMessage = { role: 'assistant', content: streamedContent };
    if (sources.length) assistantMsg.annotations = sources;
    if (reasoningContent) assistantMsg.reasoning = reasoningContent;
    if (usage) assistantMsg.meta = usageToMeta(usage);

    mutateActiveSession((s) => ({ ...s, messages: [...s.messages, assistantMsg], timestamp: Date.now() }));
    persistActiveSession();
    endStream();
  } catch (e) {
    if (isAbortError(e)) {
      if (streamedContent) {
        const stopped: ChatMessage = { role: 'assistant', content: `${streamedContent} [Stopped]` };
        if (sources.length) stopped.annotations = sources;
        if (reasoningContent) stopped.reasoning = reasoningContent;
        mutateActiveSession((s) => ({ ...s, messages: [...s.messages, stopped], timestamp: Date.now() }));
        persistActiveSession();
      }
      endStream();
    } else {
      const message =
        e instanceof ApiError
          ? e.userMessage
          : e instanceof Error
            ? e.message
            : 'Request failed.';
      failStream(message);
    }
  } finally {
    abortController = null;
    // Canvas protocol: open / update the panel if the model emitted a block
    try {
      parseCanvasBlocks(streamedContent).blocks.forEach(applyCanvasBlock);
    } catch {
      /* malformed block — ignore */
    }
  }
};
