import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { MessageList } from './components/chat/MessageList';
import { initChatStore } from './stores/chatStore';
import { initModels } from './stores/modelsStore';
import { initSettings } from './stores/settingsStore';
import { openTts } from './stores/uiStore';
import { sendMessage, triggerCompletion } from './stores/sendActions';
import { openArtifact } from './stores/artifactStore';
import { openCanvasFromChip } from './stores/canvasStore';
import type { CanvasBlock } from './types/canvas';

export default function App(): JSX.Element {
  useEffect(() => {
    initSettings();
    initChatStore();
    void initModels();
  }, []);

  return (
    <AppShell>
      <MessageList
        onRegenerate={() => void triggerCompletion()}
        onEdited={() => void triggerCompletion()}
        onListen={(text) => openTts(text)}
        onPickPrompt={(prompt) => void sendMessage(prompt, [])}
        onOpenArtifact={(code, lang) => openArtifact(code, lang)}
        onOpenCanvasChip={(payload) => {
          try {
            openCanvasFromChip(payload as CanvasBlock);
          } catch {
            /* malformed chip — ignore */
          }
        }}
      />
    </AppShell>
  );
}
