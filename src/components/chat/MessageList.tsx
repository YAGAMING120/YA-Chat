import { useEffect, useRef } from 'react';
import { dropLastAssistantMessage, editUserMessage, useChatState } from '../../stores/chatStore';
import { useStreamState } from '../../stores/streamStore';
import { EmptyState } from './EmptyState';
import { MessageBubble } from './MessageBubble';
import { StreamingMessage } from './StreamingMessage';

export interface MessageListProps {
  /** The reply was cut; the send pipeline should request a new completion. */
  onRegenerate?: () => void;
  /** A user message was edited and truncated; a new completion is expected. */
  onEdited?: (newText: string) => void;
  onListen?: (text: string) => void;
  onOpenArtifact?: (code: string, lang: string) => void;
  onOpenCanvasChip?: (payload: unknown) => void;
  onPickPrompt?: (prompt: string) => void;
}

export function MessageList({
  onRegenerate,
  onEdited,
  onListen,
  onOpenArtifact,
  onOpenCanvasChip,
  onPickPrompt
}: MessageListProps): JSX.Element {
  const { activeSession } = useChatState();
  const stream = useStreamState();
  const messages = activeSession?.messages ?? [];
  const sessionId = activeSession?.id ?? null;
  const lastContent = messages.length > 0 ? messages[messages.length - 1]!.content : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number | null>(null);
  const prevLastRef = useRef<unknown>(null);
  const prevSessionRef = useRef<string | null>(null);

  // New messages / session switches scroll to the bottom; live stream tokens
  // follow the legacy "smart scroll" — only when already within 100px of end.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sessionChanged = prevSessionRef.current !== sessionId;
    const firstRun = prevCountRef.current === null;
    const countChanged = !firstRun && messages.length !== prevCountRef.current;
    const lastChanged = !firstRun && lastContent !== prevLastRef.current;
    prevSessionRef.current = sessionId;
    prevCountRef.current = messages.length;
    prevLastRef.current = lastContent;

    if (sessionChanged || countChanged || lastChanged) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 100) el.scrollTop = el.scrollHeight;
  }, [sessionId, messages.length, lastContent, stream.active, stream.started, stream.content, stream.reasoning, stream.error]);

  const handleRegenerate = (): void => {
    if (dropLastAssistantMessage()) onRegenerate?.();
  };

  const handleEditResend = (index: number, newText: string): void => {
    editUserMessage(index, newText);
    onEdited?.(newText);
  };

  if (messages.length === 0) {
    return (
      <div id="chat-messages" className="chat-messages" ref={scrollRef}>
        <EmptyState onPickPrompt={onPickPrompt} />
        <StreamingMessage onListen={onListen} onRegenerate={handleRegenerate} />
      </div>
    );
  }

  return (
    <div id="chat-messages" className="chat-messages" ref={scrollRef}>
      {messages.map((message, index) => (
        <MessageBubble
          key={index}
          message={message}
          index={index}
          onEditResend={handleEditResend}
          onRegenerate={handleRegenerate}
          onListen={onListen}
          onOpenArtifact={onOpenArtifact}
          onOpenCanvasChip={onOpenCanvasChip}
        />
      ))}
      <StreamingMessage onListen={onListen} onRegenerate={handleRegenerate} />
    </div>
  );
}
