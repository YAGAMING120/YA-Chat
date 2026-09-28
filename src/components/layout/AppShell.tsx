import type { ReactNode } from 'react';
import { IconSprite } from '../common/Icon';
import { ToastHost } from '../common/ToastHost';
import { Sidebar } from '../sidebar/Sidebar';
import { Header } from './Header';
import { Composer } from '../composer/Composer';
import { ArtifactPanel } from '../artifact/ArtifactPanel';
import { CanvasPanel } from '../canvas/CanvasPanel';
import { SettingsModal } from '../settings/SettingsModal';
import { ModelsModal } from '../models/ModelsModal';
import { TtsModal } from '../tts/TtsModal';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { closeSettings, useUiState } from '../../stores/uiStore';

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  useKeyboardShortcuts();
  const { settingsOpen, sidePanel } = useUiState();

  // One visible side panel at a time (they share the right-hand rail).
  const appClass =
    sidePanel === 'artifact'
      ? 'app-container app--panel-open'
      : sidePanel === 'canvas'
        ? 'app-container app--canvas-open'
        : 'app-container';

  return (
    <>
      <div id="app" className={appClass}>
        <Sidebar />

        <main className="main-content">
          <div className="background-effects">
            <div className="glow glow--orange" />
            <div className="glow glow--amber" />
          </div>

          <Header />
          <div className="chat-container">
            {children}
            <Composer />
          </div>
        </main>

        <ArtifactPanel />
        <CanvasPanel />
      </div>

      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <ModelsModal />
      <TtsModal />
      <ToastHost />
      <IconSprite />
    </>
  );
}
