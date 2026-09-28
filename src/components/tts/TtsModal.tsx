import { useEffect, useMemo, useRef, useState } from 'react';
import { closeTts, showToast, useUiState } from '../../stores/uiStore';
import { getModelEntry, getSpeechModels, useModelsState } from '../../stores/modelsStore';
import { getApiKey } from '../../stores/settingsStore';
import { toSpeechText, TTS_MAX_CHARS } from '../../lib/tts';
import { createSpeech } from '../../services/openrouter/speech';
import { ApiError, isAbortError } from '../../services/openrouter/errors';
import { cn } from '../../lib/cn';

type TtsStatus = 'idle' | 'loading' | 'error' | 'done';

const SPEEDS: Array<{ value: string; label: string }> = [
  { value: '0.75', label: '0.75×' },
  { value: '1', label: '1× (normal)' },
  { value: '1.25', label: '1.25×' },
  { value: '1.5', label: '1.5×' },
  { value: '2', label: '2×' }
];

/**
 * Text-to-Speech modal (ported from js/tts.js). Stays mounted so the
 * generated audio survives close/reopen, like the legacy inline-styled modal.
 */
export function TtsModal(): JSX.Element {
  const { ttsOpen, ttsText, ttsModelId, ttsSeq } = useUiState();
  const { models } = useModelsState();
  const speechModels = useMemo(() => getSpeechModels(), [models]);

  const [text, setText] = useState('');
  const [model, setModel] = useState('');
  const [voice, setVoice] = useState('');
  const [speed, setSpeed] = useState('1');
  const [format, setFormat] = useState('mp3');
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voices = useMemo(
    () => (model ? getModelEntry(model)?.voices ?? [] : []),
    [model, models]
  );

  // Seed on open — legacy openTTS()
  useEffect(() => {
    if (!ttsOpen || ttsSeq === 0) return;
    const seeded = toSpeechText(ttsText);
    setText(seeded.substring(0, TTS_MAX_CHARS));
    if (ttsModelId && speechModels.some((m) => m.id === ttsModelId)) setModel(ttsModelId);
    else if (speechModels[0]) setModel(speechModels[0].id);
    if (!seeded) setTimeout(() => textRef.current?.focus(), 50);
    // Intentionally keyed on ttsSeq only — re-seeding on catalog changes
    // would clobber what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSeq]);

  // Keep a valid model selected while the catalog loads (legacy subscribeCatalog)
  useEffect(() => {
    if (!ttsOpen || speechModels.length === 0) return;
    if (!model || !speechModels.some((m) => m.id === model)) setModel(speechModels[0]!.id);
  }, [ttsOpen, speechModels, model]);

  // Voice list belongs to the selected model (legacy renderVoices)
  useEffect(() => {
    setVoice(voices[0] ?? '');
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape / overlay close aborts any in-flight synthesis (legacy closeTTS)
  useEffect(() => {
    if (!ttsOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [ttsOpen]);

  // Autoplay the fresh audio (legacy plays right after setting src)
  useEffect(() => {
    if (status === 'done') {
      try {
        void audioRef.current?.play()?.catch(() => undefined);
      } catch {
        /* player not available */
      }
    }
  }, [status, audioUrl]);

  const count = text.length;
  const loading = status === 'loading';
  const done = status === 'done' && !!audioUrl;
  const statusText =
    loading ? 'Synthesizing audio…'
    : status === 'error' ? errorMessage
    : status === 'done' ? 'Ready — play it below or download the file.'
    : '';

  const generate = async (): Promise<void> => {
    const input = toSpeechText(text);
    if (!input) {
      showToast('Type some text to convert to speech.', 'error');
      textRef.current?.focus();
      return;
    }
    if (input.length > TTS_MAX_CHARS) {
      showToast(
        `Text is too long — keep it under ${TTS_MAX_CHARS.toLocaleString()} characters.`,
        'error'
      );
      return;
    }
    if (!model) {
      showToast('No speech model available. Check your models list.', 'error');
      return;
    }

    const pickedVoice = voices.includes(voice) ? voice : (voices[0] ?? '');
    const speedValue = parseFloat(speed) || 1;

    setStatus('loading');
    setErrorMessage('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const blob = await createSpeech(
        { model, input, voice: pickedVoice, speed: speedValue, format },
        controller.signal,
        getApiKey() || undefined
      );
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const mime = format === 'pcm' ? 'audio/wav' : 'audio/mpeg';
      urlRef.current = URL.createObjectURL(new Blob([blob], { type: mime }));
      setAudioUrl(urlRef.current);
      setStatus('done');
      showToast('Speech generated — press play or download it.', 'success');
    } catch (e) {
      if (isAbortError(e)) {
        setStatus('idle');
        return;
      }
      const message =
        e instanceof ApiError
          ? e.userMessage
          : e instanceof Error
            ? e.message
            : 'Speech generation failed.';
      setErrorMessage(message);
      setStatus('error');
      showToast(message, 'error');
    } finally {
      abortRef.current = null;
    }
  };

  const handleClose = (): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    closeTts();
  };

  return (
    <div
      className="modal-overlay"
      id="modal-tts"
      style={{ display: ttsOpen ? 'flex' : 'none' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="modal" id="tts-modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal__header">
          <h2 className="modal__title">Text to Speech</h2>
          <button
            type="button"
            className="btn-icon btn-close-modal"
            id="btn-close-tts"
            onClick={handleClose}
            aria-label="Close"
          >
            <svg className="icon">
              <use href="#icon-plus" style={{ transform: 'rotate(45deg)' }} />
            </svg>
          </button>
        </div>
        <div className="modal__body">
          <label className="form-label" htmlFor="tts-text">
            Text to speak
          </label>
          <textarea
            id="tts-text"
            ref={textRef}
            className="form-input tts-textarea"
            rows={5}
            placeholder="Type or paste the text you want converted to speech..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="tts-meta">
            <span id="tts-count" className={cn('tts-count', count > TTS_MAX_CHARS && 'tts-count--over')}>
              {count.toLocaleString()} / {TTS_MAX_CHARS.toLocaleString()}
            </span>
          </div>

          <div className="tts-grid">
            <div>
              <label className="form-label" htmlFor="tts-model">
                Voice model
              </label>
              <select
                id="tts-model"
                className="form-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {speechModels.length === 0 ? (
                  <option value="">No speech models loaded yet</option>
                ) : (
                  speechModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.free ? ' — FREE' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="tts-voice">
                Voice
              </label>
              <select
                id="tts-voice"
                className="form-input"
                value={voices.length > 0 ? (voices.includes(voice) ? voice : voices[0]) : voice}
                onChange={(e) => setVoice(e.target.value)}
              >
                {voices.length === 0 ? (
                  <option value="">Provider default voice</option>
                ) : (
                  voices.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <div className="tts-grid">
            <div>
              <label className="form-label" htmlFor="tts-speed">
                Speed
              </label>
              <select
                id="tts-speed"
                className="form-input"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
              >
                {SPEEDS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="tts-format">
                Format
              </label>
              <select
                id="tts-format"
                className="form-input"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="mp3">MP3</option>
                <option value="pcm">PCM (raw)</option>
              </select>
            </div>
          </div>

          <div className="tts-actions">
            <button
              type="button"
              className="btn-primary"
              id="tts-generate"
              disabled={loading}
              onClick={() => void generate()}
            >
              <svg
                className="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span className="tts-generate__label">
                {loading ? 'Generating…' : 'Generate speech'}
              </span>
            </button>
            <a
              className="btn-secondary"
              id="tts-download"
              href={done && audioUrl ? audioUrl : undefined}
              download="speech.mp3"
              style={{ display: done ? 'inline-flex' : 'none' }}
            >
              <svg
                className="icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download MP3
            </a>
          </div>

          <div
            id="tts-status"
            className={cn(
              'tts-status',
              status === 'error' && 'tts-status--error',
              status === 'done' && 'tts-status--ok'
            )}
            style={{ display: status === 'idle' ? 'none' : 'block' }}
          >
            {statusText}
          </div>
          <audio
            id="tts-audio"
            ref={audioRef}
            className="tts-audio"
            controls
            src={audioUrl ?? undefined}
            style={{ display: done ? 'block' : 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
