import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type { LanguageMode, SavedVoicePresetConfig } from '../types';
import { analyzeCloneAudioInBrowser } from '../utils/clientVoiceClone';

const MAX_RECORD_SECONDS = 30;

const CALIBRATION_PROMPTS: Record<LanguageMode, string> = {
  en: '“Every great story begins with a single clear voice. Speak naturally for up to thirty seconds, pausing briefly at commas and keeping an even microphone distance so Svara Studio captures your pitch, cadence, and vocal warmth.”',
  hi: '“हर बेहतरीन कहानी एक स्पष्ट और स्वाभाविक आवाज़ से शुरू होती है। तीस सेकंड तक सामान्य गति से बोलें, ताकि आपकी पिच, लय और आवाज़ की गहराई को सटीकता से कैप्चर किया जा सके।”',
  bilingual:
    '“Welcome to Svara Studio — आज हम अपना खुद का AI voice clone तैयार कर रहे हैं। Speak comfortably in your natural bilingual flow for up to thirty seconds with balanced pacing and clear diction.”',
};

const DEFAULT_AUDITION_TEXT: Record<LanguageMode, string> = {
  en: 'Hello! This is a quick test audition of my newly cloned Svara Studio voice preset.',
  hi: 'नमस्कार! यह मेरे नए क्लोन किए गए स्वर प्रीसेट का एक त्वरित ऑडिशन परीक्षण है।',
  bilingual:
    'Hey everyone! यह मेरी नई cloned voice है, ready for English and हिन्दी narration.',
};

interface VoiceCloningTabProps {
  savedPresets: SavedVoicePresetConfig[];
  isAuditioning: boolean;
  onSaveClonePreset: (preset: SavedVoicePresetConfig, allPresets?: SavedVoicePresetConfig[]) => void;
  onDeletePreset: (id: string) => Promise<void> | void;
  onAuditionClone: (preset: SavedVoicePresetConfig, auditionText: string) => Promise<void> | void;
  onUseCloneInStudio: (preset: SavedVoicePresetConfig) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio data.'));
    reader.readAsDataURL(blob);
  });
}

export function VoiceCloningTab({
  savedPresets,
  isAuditioning,
  onSaveClonePreset,
  onDeletePreset,
  onAuditionClone,
  onUseCloneInStudio,
}: VoiceCloningTabProps) {
  const clonedPresets = savedPresets.filter((p) => p.isClone || /^clone\b/i.test(p.name));

  const [presetName, setPresetName] = useState('Studio Host');
  const [language, setLanguage] = useState<LanguageMode>('en');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedSourceLabel, setCapturedSourceLabel] = useState<string | null>(null);
  const [capturedDurationMs, setCapturedDurationMs] = useState<number>(0);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const [activeClone, setActiveClone] = useState<SavedVoicePresetConfig | null>(
    () => clonedPresets[0] ?? null
  );
  const [auditionText, setAuditionText] = useState<string>(DEFAULT_AUDITION_TEXT.en);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const chunksRef = useRef<BlobPart[]>([]);

  // Keep activeClone synced if savedPresets changes externally
  useEffect(() => {
    if (activeClone && !savedPresets.some((p) => p.id === activeClone.id)) {
      setActiveClone(clonedPresets[0] ?? null);
    } else if (!activeClone && clonedPresets.length > 0) {
      setActiveClone(clonedPresets[0]);
    }
  }, [savedPresets, activeClone, clonedPresets]);

  // Clean up object URLs & active mic streams on unmount
  useEffect(() => {
    return () => {
      stopMicResources();
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMicResources = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const drawIdleMeter = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const barCount = 40;
    const gap = 3;
    const barW = (width - gap * (barCount - 1)) / barCount;
    ctx.fillStyle = '#CBD5E1';
    for (let i = 0; i < barCount; i += 1) {
      const h = 4;
      ctx.fillRect(i * (barW + gap), (height - h) / 2, barW, h);
    }
  };

  useEffect(() => {
    if (!isRecording) drawIdleMeter();
  }, [isRecording]);

  const drawLiveMeter = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const render = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      const barCount = 40;
      const gap = 3;
      const barW = (width - gap * (barCount - 1)) / barCount;
      const step = Math.max(1, Math.floor(data.length / barCount));

      for (let i = 0; i < barCount; i += 1) {
        const amp = (data[i * step] || 0) / 255;
        const barH = Math.max(4, Math.round(amp * (height - 8)));
        ctx.fillStyle = amp > 0.7 ? '#DC2626' : '#2563EB';
        ctx.fillRect(i * (barW + gap), (height - barH) / 2, barW, barH);
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    stopMicResources();
  };

  const handleStartRecording = async () => {
    setErrorMsg(null);
    setStatusNote(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg(
        'Microphone recording is unavailable in this browser. Upload a .wav, .mp3, or .webm voice clip below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      }

      const preferredMime = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported?.('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const durationMs = Math.max(
          500,
          Math.min(MAX_RECORD_SECONDS * 1000, Math.round(performance.now() - startTimeRef.current))
        );
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        if (capturedUrl) URL.revokeObjectURL(capturedUrl);
        const url = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedUrl(url);
        setCapturedDurationMs(durationMs);
        setCapturedSourceLabel(`Microphone capture (${(durationMs / 1000).toFixed(1)}s)`);
        stopMicResources();
      };

      mediaRecorderRef.current = recorder;
      startTimeRef.current = performance.now();
      setElapsedSeconds(0);
      setIsRecording(true);
      recorder.start(250);
      drawLiveMeter();

      timerRef.current = window.setInterval(() => {
        const sec = (performance.now() - startTimeRef.current) / 1000;
        if (sec >= MAX_RECORD_SECONDS) {
          setElapsedSeconds(MAX_RECORD_SECONDS);
          handleStopRecording();
        } else {
          setElapsedSeconds(Number(sec.toFixed(1)));
        }
      }, 100);
    } catch (err) {
      stopMicResources();
      setIsRecording(false);
      setErrorMsg(
        err instanceof Error
          ? `Microphone access failed (${err.message}). You can upload a 5–30s voice clip instead.`
          : 'Microphone permission was denied. Upload a 5–30s voice clip instead.'
      );
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    setStatusNote(null);

    if (file.size < 256) {
      setErrorMsg('Selected audio file is empty.');
      return;
    }

    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    const url = URL.createObjectURL(file);
    setCapturedBlob(file);
    setCapturedUrl(url);
    setCapturedSourceLabel(`Uploaded file: ${file.name}`);

    try {
      const audio = new Audio(url);
      await new Promise<void>((resolve) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => resolve();
        setTimeout(resolve, 1000);
      });
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setCapturedDurationMs(Math.min(MAX_RECORD_SECONDS * 1000, Math.round(audio.duration * 1000)));
      } else {
        setCapturedDurationMs(8000);
      }
    } catch {
      setCapturedDurationMs(8000);
    }
  };

  const handleResetCapture = () => {
    if (isRecording) handleStopRecording();
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedBlob(null);
    setCapturedUrl(null);
    setCapturedSourceLabel(null);
    setCapturedDurationMs(0);
    setElapsedSeconds(0);
    setErrorMsg(null);
    setStatusNote(null);
  };

  const handleCreateClone = async () => {
    if (!capturedBlob) {
      setErrorMsg('Record up to 30 seconds or upload an audio sample first.');
      return;
    }
    setErrorMsg(null);
    setStatusNote(null);
    setIsAnalyzing(true);

    try {
      const audioBase64 = await blobToBase64(capturedBlob);
      const res = await fetch('/api/audio/clone-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: capturedBlob.type || 'audio/webm',
          presetName: presetName.trim() || 'My Studio Voice',
          language,
        }),
      });

      const data = (await res.json()) as {
        preset?: SavedVoicePresetConfig;
        presets?: SavedVoicePresetConfig[];
        error?: string;
      };

      if (!res.ok || !data.preset) {
        throw new Error(data.error || 'Server voice cloning failed.');
      }

      onSaveClonePreset(data.preset, data.presets);
      setActiveClone(data.preset);
      setAuditionText(DEFAULT_AUDITION_TEXT[language]);
      setStatusNote(`Created "${data.preset.name}" and saved to Voice Presets.`);
    } catch {
      // Offline / unreachable server fallback via Web Audio API analysis
      try {
        const { preset } = await analyzeCloneAudioInBrowser({
          audioBlob: capturedBlob,
          presetName: presetName.trim() || 'My Studio Voice',
          language,
          durationMsHint: capturedDurationMs || 8000,
        });
        onSaveClonePreset(preset);
        setActiveClone(preset);
        setAuditionText(DEFAULT_AUDITION_TEXT[language]);
        setStatusNote(
          `Created "${preset.name}" offline using browser acoustic analysis.`
        );
      } catch (innerErr) {
        setErrorMsg(
          innerErr instanceof Error ? innerErr.message : 'Unable to analyze voice sample.'
        );
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const progressPct = Math.min(100, (elapsedSeconds / MAX_RECORD_SECONDS) * 100);

  return (
    <div className="space-y-6" data-testid="voice-cloning-tab">
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-medium hover:underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {statusNote && (
        <div
          role="status"
          className="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-sm"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{statusNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: 30s Capture & Upload Workspace */}
        <section
          aria-label="Voice sample capture"
          className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="clone-preset-name"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Clone Voice Name
              </label>
              <input
                id="clone-preset-name"
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Studio Host"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label
                htmlFor="clone-language-select"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Primary Language Target
              </label>
              <select
                id="clone-language-select"
                value={language}
                onChange={(e) => {
                  const next = e.target.value as LanguageMode;
                  setLanguage(next);
                  setAuditionText(DEFAULT_AUDITION_TEXT[next]);
                }}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
                <option value="bilingual">Bilingual (EN + HI)</option>
              </select>
            </div>
          </div>

          {/* Reading Script */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              30-Second Calibration Script
            </p>
            <p className="text-sm leading-relaxed text-[#0F172A] dark:text-slate-200">
              {CALIBRATION_PROMPTS[language]}
            </p>
          </div>

          {/* Live Microphone Recorder */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {isRecording && (
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"
                    aria-hidden="true"
                  />
                )}
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {isRecording ? 'Recording microphone sample...' : 'Microphone Level Meter'}
                </span>
              </div>
              <span
                data-testid="clone-record-timer"
                className="text-sm font-mono tabular-nums font-semibold text-[#0F172A] dark:text-slate-100"
              >
                {elapsedSeconds.toFixed(1)}s / {MAX_RECORD_SECONDS}.0s
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  elapsedSeconds >= 25 ? 'bg-amber-500' : 'bg-[#2563EB]'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <canvas
              ref={canvasRef}
              width={560}
              height={56}
              aria-label="Live microphone input waveform"
              className="w-full h-14 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
            />

            <div className="flex flex-wrap items-center gap-2.5">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={handleStartRecording}
                  data-testid="clone-start-recording"
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#DC2626] text-white text-sm font-medium hover:bg-red-700 transition-colors whitespace-nowrap"
                >
                  <Mic className="w-4 h-4" />
                  <span>Record 30s Voice Sample</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  data-testid="clone-stop-recording"
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#0F172A] dark:bg-slate-100 text-white dark:text-[#0F172A] text-sm font-medium hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Recording</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a"
                data-testid="clone-file-input"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording}
                data-testid="clone-upload-btn"
                className="inline-flex items-center gap-2 px-3.5 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Audio Sample</span>
              </button>

              {capturedBlob && (
                <button
                  type="button"
                  onClick={handleResetCapture}
                  className="inline-flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {capturedUrl && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {capturedSourceLabel}
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {(capturedBlob!.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <audio controls src={capturedUrl} className="w-full h-9" />
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Extracts F0 pitch, speaking WPM, warmth, and register into a reusable Clone preset.
            </p>
            <button
              type="button"
              onClick={handleCreateClone}
              disabled={!capturedBlob || isRecording || isAnalyzing}
              data-testid="create-clone-preset-btn"
              className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-colors whitespace-nowrap shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Voice...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Clone Preset</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right: Active Clone Profile, Instant Audition & Saved Clones */}
        <aside
          aria-label="Cloned voice audition and presets"
          className="xl:col-span-5 space-y-5"
        >
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                Cloned Voice Profile &amp; Audition
              </h2>
              {activeClone && (
                <button
                  type="button"
                  onClick={() => onUseCloneInStudio(activeClone)}
                  data-testid="use-clone-in-studio-btn"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  <span>Use in Studio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!activeClone ? (
              <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg px-4">
                <Volume2 className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-[#0F172A] dark:text-slate-200">
                  No cloned preset active yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Record a 30-second sample or upload an audio clip on the left to generate and audition your custom Clone preset.
                </p>
              </div>
            ) : (
              <div className="space-y-4" data-testid="active-clone-card">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[#0F172A] dark:text-slate-100">
                    {activeClone.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeClone.cloneAcousticProfile?.timbreSummary || activeClone.stylePrompt}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center border-y border-slate-100 dark:border-slate-800 py-3">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Pitch F0</p>
                    <p className="text-sm font-mono tabular-nums font-semibold text-[#0F172A] dark:text-slate-100">
                      {activeClone.cloneAcousticProfile?.pitchHz ?? 152} Hz
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Cadence</p>
                    <p className="text-sm font-mono tabular-nums font-semibold text-[#0F172A] dark:text-slate-100">
                      {activeClone.cloneAcousticProfile?.speakingWpm ?? 142} WPM
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Register</p>
                    <p className="text-sm font-semibold capitalize text-[#0F172A] dark:text-slate-100">
                      {activeClone.pitchRegister}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="clone-audition-text"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Instant Test Audition Script
                  </label>
                  <textarea
                    id="clone-audition-text"
                    rows={3}
                    value={auditionText}
                    onChange={(e) => setAuditionText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                  />
                  <button
                    type="button"
                    disabled={isAuditioning || !auditionText.trim()}
                    onClick={() => onAuditionClone(activeClone, auditionText)}
                    data-testid="audition-clone-btn"
                    className="w-full inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {isAuditioning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Synthesizing Audition...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Test Cloned Voice</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                Saved Voice Clones
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {clonedPresets.length}
              </span>
            </div>

            {clonedPresets.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                Your generated Clone presets will be saved here for instant audition and reuse in Speech Studio.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {clonedPresets.map((clone) => (
                  <div
                    key={clone.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveClone(clone)}
                      className="text-left min-w-0 flex-1 group"
                    >
                      <p className="text-sm font-medium text-[#0F172A] dark:text-slate-100 truncate group-hover:text-[#2563EB] dark:group-hover:text-blue-400">
                        {clone.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                        {clone.cloneAcousticProfile?.pitchHz
                          ? `${clone.cloneAcousticProfile.pitchHz} Hz · `
                          : ''}
                        {clone.pitchRegister} · {clone.speed.toFixed(2)}x
                      </p>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUseCloneInStudio(clone)}
                        className="px-2.5 h-7 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePreset(clone.id)}
                        aria-label={`Delete ${clone.name}`}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
