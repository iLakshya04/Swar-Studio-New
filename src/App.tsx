import { useEffect, useState } from 'react';
import { AudioWaveform, Moon, Plus, Sun } from 'lucide-react';
import { AudioPlayerBar, type ActiveTrack } from './components/AudioPlayerBar';
import { HistoryPanel } from './components/HistoryPanel';
import { McpConnectPanel } from './components/McpConnectPanel';
import { PronunciationModal } from './components/PronunciationModal';
import { SidebarNav, type ActiveTab } from './components/SidebarNav';
import { SpeechStudio } from './components/SpeechStudio';
import { VoiceLibrary } from './components/VoiceLibrary';
import { DEFAULT_DIALOGUE_LINES, SAMPLE_TEMPLATES, VOICE_PRESETS } from './data/voices';
import type {
  ChannelCount,
  DialogueLine,
  EmotionIntensity,
  EngineTier,
  GenerateRequestPayload,
  GenerateResponsePayload,
  HistoryItem,
  LanguageMode,
  MasteringPreset,
  PitchRegister,
  PronunciationEntry,
  SampleRateHz,
  SavedVoicePresetConfig,
  SpeakerConfig,
  StudioMode,
  VoicePreset,
} from './types';
import { validateGeneratePayload } from './utils/speechLogic';

const HISTORY_STORAGE_KEY = 'svara_studio_history_v1';
const PRONUNCIATION_STORAGE_KEY = 'svara_pronunciations_v1';
const THEME_STORAGE_KEY = 'svara_theme_v1';
const MAX_STORED_CLIPS = 10;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_STORED_CLIPS)));
  } catch {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, 3)));
    } catch {
      // Ignore storage quota overflow gracefully
    }
  }
}

function loadCachedPronunciations(): PronunciationEntry[] {
  try {
    const raw = localStorage.getItem(PRONUNCIATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadInitialDarkMode(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

export default function App() {
  const defaultTemplate = SAMPLE_TEMPLATES[0];
  const defaultVoice =
    VOICE_PRESETS.find((v) => v.id === defaultTemplate.voiceId) ?? VOICE_PRESETS[0];

  const [isDark, setIsDark] = useState<boolean>(() => loadInitialDarkMode());
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [mode, setMode] = useState<StudioMode>('single');
  const [language, setLanguage] = useState<LanguageMode>(defaultTemplate.language);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(defaultVoice.id);
  const [voiceDesignMode, setVoiceDesignMode] = useState<'prebuilt' | 'custom'>('prebuilt');
  const [customVoiceDescription, setCustomVoiceDescription] = useState<string>('');
  const [stylePrompt, setStylePrompt] = useState<string>(defaultTemplate.stylePrompt);
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitchRegister, setPitchRegister] = useState<PitchRegister>('balanced');
  const [emotionIntensity, setEmotionIntensity] = useState<EmotionIntensity>('natural');
  const [engineTier, setEngineTier] = useState<EngineTier>('expressive');
  const [sampleRate, setSampleRate] = useState<SampleRateHz>(48000);
  const [channels, setChannels] = useState<ChannelCount>(1);
  const [masteringPreset, setMasteringPreset] = useState<MasteringPreset>('none');
  const [normalizeAudio, setNormalizeAudio] = useState<boolean>(true);
  const [targetDurationSec, setTargetDurationSec] = useState<string>('');
  const [text, setText] = useState<string>(defaultTemplate.text);

  const [speakers, setSpeakers] = useState<{ A: SpeakerConfig; B: SpeakerConfig }>({
    A: {
      name: 'Vikram',
      voiceId: 'vikram',
      baseVoice: 'Puck',
      style: 'Upbeat, conversational bilingual podcast host',
    },
    B: {
      name: 'Ananya',
      voiceId: 'ananya',
      baseVoice: 'Zephyr',
      style: 'Warm, articulate co-host',
    },
  });
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>(DEFAULT_DIALOGUE_LINES);

  const [pronunciations, setPronunciations] = useState<PronunciationEntry[]>(() =>
    loadCachedPronunciations()
  );
  const [isPronunciationModalOpen, setIsPronunciationModalOpen] = useState<boolean>(false);
  const [savedPresets, setSavedPresets] = useState<SavedVoicePresetConfig[]>([]);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [regeneratingSegIdx, setRegeneratingSegIdx] = useState<number | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverAppUrl, setServerAppUrl] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const [latestResult, setLatestResult] = useState<GenerateResponsePayload | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage error
    }
  }, [isDark]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(PRONUNCIATION_STORAGE_KEY, JSON.stringify(pronunciations));
    } catch {
      // Ignore storage error
    }
  }, [pronunciations]);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { mcpEndpoint?: string }) => {
        if (data?.mcpEndpoint) {
          setServerAppUrl(data.mcpEndpoint.replace(/\/mcp$/, ''));
        }
      })
      .catch(() => {});

    fetch('/api/pronunciations')
      .then((res) => res.json())
      .then((data: { entries?: PronunciationEntry[] }) => {
        if (Array.isArray(data.entries)) {
          setPronunciations((prev) => {
            if (prev.length === 0) return data.entries!;
            const merged = [...data.entries!];
            for (const localItem of prev) {
              if (!merged.some((m) => m.term.toLowerCase() === localItem.term.toLowerCase())) {
                merged.push(localItem);
              }
            }
            return merged;
          });
        }
      })
      .catch(() => {});

    fetch('/api/presets')
      .then((res) => res.json())
      .then((data: { presets?: SavedVoicePresetConfig[] }) => {
        if (Array.isArray(data.presets)) {
          setSavedPresets(data.presets);
        }
      })
      .catch(() => {});
  }, []);

  const selectedVoice =
    VOICE_PRESETS.find((v) => v.id === selectedVoiceId) ?? VOICE_PRESETS[0];

  const handleSelectVoiceById = (id: string) => {
    const found = VOICE_PRESETS.find((v) => v.id === id);
    if (!found) return;
    setSelectedVoiceId(found.id);
    setStylePrompt(found.defaultStyle);
    setVoiceDesignMode('prebuilt');
  };

  const handleUseVoiceInStudio = (voice: VoicePreset) => {
    setSelectedVoiceId(voice.id);
    setStylePrompt(voice.defaultStyle);
    setLanguage(voice.sampleLanguage);
    setVoiceDesignMode('prebuilt');
    if (!text.trim()) {
      setText(voice.sampleText);
    }
    setActiveTab('studio');
    setErrorMessage(null);
  };

  const handleResetScript = () => {
    setMode('single');
    setText('');
    setLatestResult(null);
    setErrorMessage(null);
    setActiveTab('studio');
  };

  const handleSavePronunciation = async (input: {
    id?: string;
    term: string;
    phonetic: string;
    ipa?: string;
    language: LanguageMode;
    notes?: string;
    enabled: boolean;
  }) => {
    try {
      const res = await fetch('/api/pronunciations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as { entries?: PronunciationEntry[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not save rule.');
      if (Array.isArray(data.entries)) {
        setPronunciations(data.entries);
        return;
      }
    } catch {
      // Fallback to local state update
    }
    setPronunciations((prev) => [
      {
        id: input.id || `pron-${Date.now()}`,
        term: input.term,
        phonetic: input.phonetic,
        ipa: input.ipa,
        language: input.language,
        notes: input.notes,
        enabled: input.enabled,
        createdAt: new Date().toISOString(),
      },
      ...prev.filter((p) => p.term.toLowerCase() !== input.term.toLowerCase()),
    ]);
  };

  const handleTogglePronunciation = async (entry: PronunciationEntry) => {
    await handleSavePronunciation({
      ...entry,
      enabled: !entry.enabled,
    });
  };

  const handleDeletePronunciation = async (id: string) => {
    setPronunciations((prev) => prev.filter((p) => p.id !== id));
    fetch(`/api/pronunciations/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  };

  const handleApplySavedPreset = (presetId: string) => {
    const preset = savedPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedVoiceId(preset.voiceId);
    setLanguage(preset.language);
    setStylePrompt(preset.stylePrompt);
    setSpeed(preset.speed);
    setPitchRegister(preset.pitchRegister);
    setEmotionIntensity(preset.emotionIntensity);
    if (preset.customVoiceDescription) {
      setVoiceDesignMode('custom');
      setCustomVoiceDescription(preset.customVoiceDescription);
    } else {
      setVoiceDesignMode('prebuilt');
    }
    if (preset.masteringPreset) setMasteringPreset(preset.masteringPreset);
    if (preset.sampleRate) setSampleRate(preset.sampleRate);
    if (preset.channels) setChannels(preset.channels);
  };

  const handleSaveCurrentPreset = async (name: string) => {
    const payload = {
      name,
      voiceId: selectedVoice.id,
      language,
      stylePrompt,
      customVoiceDescription: voiceDesignMode === 'custom' ? customVoiceDescription : undefined,
      speed,
      pitchRegister,
      emotionIntensity,
      masteringPreset,
      sampleRate,
      channels,
    };
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { presets?: SavedVoicePresetConfig[] };
    if (Array.isArray(data.presets)) {
      setSavedPresets(data.presets);
    }
  };

  const pushGeneratedClip = (
    data: GenerateResponsePayload,
    fullScript: string,
    voiceLabel: string
  ) => {
    const previewSnippet =
      fullScript.length > 72 ? `${fullScript.slice(0, 72)}...` : fullScript;

    const newItem: HistoryItem = {
      id: `clip-${Date.now()}`,
      clipId: data.clipId,
      audioUrl: data.audioUrl,
      downloadUrl: data.downloadUrl,
      createdAt: new Date().toISOString(),
      mode,
      language,
      voiceLabel,
      voiceId: selectedVoice.id,
      textPreview: previewSnippet,
      fullText: fullScript,
      stylePrompt,
      customVoiceDescription:
        voiceDesignMode === 'custom' ? customVoiceDescription : undefined,
      speed,
      pitchRegister,
      emotionIntensity,
      sampleRate: data.sampleRate || sampleRate,
      channels: data.channels || channels,
      masteringPreset,
      modelUsed: data.modelUsed,
      durationSec: data.durationEstimateSec,
      durationMs: data.durationMs,
      audioBase64: data.audioBase64,
      wordTimings: data.wordTimings,
      segments: data.segments,
      dialogueLines: mode === 'multi' ? dialogueLines : undefined,
      speakers: mode === 'multi' ? speakers : undefined,
    };

    setLatestResult(data);
    setHistory((prev) => [newItem, ...prev].slice(0, MAX_STORED_CLIPS));
    setActiveTrack({
      id: newItem.id,
      clipId: data.clipId,
      title: previewSnippet,
      subtitle: `${voiceLabel} · ${data.modelUsed}`,
      audioBase64: data.audioBase64,
      audioUrl: data.audioUrl,
      downloadUrl: data.downloadUrl,
      durationSec: data.durationEstimateSec,
      sampleRate: data.sampleRate || sampleRate,
      channels: data.channels || channels,
      wordTimings: data.wordTimings,
    });
  };

  const handleGenerate = async () => {
    const parsedTargetDur = Number(targetDurationSec);
    const payload: GenerateRequestPayload = {
      mode,
      language,
      modelTier: engineTier,
      text,
      voiceId: selectedVoice.id,
      voiceName: selectedVoice.baseVoice,
      stylePrompt,
      customVoiceDescription:
        voiceDesignMode === 'custom' ? customVoiceDescription : undefined,
      speed,
      pitchRegister,
      emotionIntensity,
      format: 'wav',
      sampleRate,
      channels,
      normalize: normalizeAudio,
      trimSilence: normalizeAudio,
      masteringPreset,
      targetDurationSeconds:
        Number.isFinite(parsedTargetDur) && parsedTargetDur > 0.4 ? parsedTargetDur : undefined,
      fitMode: Number.isFinite(parsedTargetDur) && parsedTargetDur > 0.4 ? 'stretch' : 'natural',
      pronunciationRules: pronunciations,
      speakers: mode === 'multi' ? speakers : undefined,
      dialogueLines: mode === 'multi' ? dialogueLines : undefined,
    };

    const validation = validateGeneratePayload(payload);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Please check your script inputs.');
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as GenerateResponsePayload & { error?: string };

      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'Speech generation failed.');
      }

      const fullScript =
        mode === 'multi'
          ? dialogueLines
              .filter((l) => l.text.trim())
              .map((l) => `${l.speakerKey === 'A' ? speakers.A.name : speakers.B.name}: ${l.text}`)
              .join(' ')
          : text.trim();

      const voiceLabel =
        mode === 'multi'
          ? `${speakers.A.name} & ${speakers.B.name}`
          : voiceDesignMode === 'custom' && customVoiceDescription.trim()
            ? 'Custom Voice Design'
            : `${selectedVoice.name} (${selectedVoice.roleTitle})`;

      pushGeneratedClip(data, fullScript, voiceLabel);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to generate speech right now.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateSegment = async (segmentIndex: number, nextText: string) => {
    if (!latestResult?.clipId) return;
    setRegeneratingSegIdx(segmentIndex);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/tts/segments/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: latestResult.clipId,
          segmentIndex,
          text: nextText,
          voiceId: selectedVoice.id,
          stylePrompt,
          speed,
        }),
      });
      const data = (await response.json()) as GenerateResponsePayload & { error?: string };
      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'Segment regeneration failed.');
      }
      const updatedText = data.segments?.map((s) => s.text).join(' ') || text;
      pushGeneratedClip(
        data,
        updatedText,
        `${selectedVoice.name} (${selectedVoice.roleTitle})`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to regenerate segment.'
      );
    } finally {
      setRegeneratingSegIdx(null);
    }
  };

  const handlePreviewVoice = async (voice: VoicePreset) => {
    setPreviewingVoiceId(voice.id);
    setErrorMessage(null);
    try {
      const payload: GenerateRequestPayload = {
        mode: 'single',
        language: voice.sampleLanguage,
        modelTier: 'expressive',
        text: voice.sampleText,
        voiceId: voice.id,
        voiceName: voice.baseVoice,
        stylePrompt: voice.defaultStyle,
        speed: 1.0,
        sampleRate: 48000,
        channels: 1,
        pronunciationRules: pronunciations,
      };
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as GenerateResponsePayload & { error?: string };
      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'Voice sample preview failed.');
      }

      setActiveTrack({
        id: `preview-${voice.id}-${Date.now()}`,
        clipId: data.clipId,
        title: `${voice.name} — ${voice.roleTitle}`,
        subtitle: `${voice.language} Sample · ${voice.accent}`,
        audioBase64: data.audioBase64,
        audioUrl: data.audioUrl,
        downloadUrl: data.downloadUrl,
        durationSec: data.durationEstimateSec,
        sampleRate: data.sampleRate || 48000,
        channels: data.channels || 1,
        wordTimings: data.wordTimings,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to preview voice sample.'
      );
    } finally {
      setPreviewingVoiceId(null);
    }
  };

  const handlePlayHistoryItem = (item: HistoryItem) => {
    setActiveTrack({
      id: item.id,
      clipId: item.clipId,
      title: item.textPreview,
      subtitle: `${item.voiceLabel} · ${item.modelUsed}`,
      audioBase64: item.audioBase64,
      audioUrl: item.audioUrl,
      downloadUrl: item.downloadUrl,
      durationSec: item.durationSec,
      sampleRate: item.sampleRate,
      channels: item.channels,
      wordTimings: item.wordTimings,
    });
  };

  const handleRestoreToStudio = (item: HistoryItem) => {
    setMode(item.mode);
    setLanguage(item.language);
    setSelectedVoiceId(item.voiceId);
    setStylePrompt(item.stylePrompt);
    setSpeed(item.speed);
    if (item.pitchRegister) setPitchRegister(item.pitchRegister);
    if (item.emotionIntensity) setEmotionIntensity(item.emotionIntensity);
    if (item.sampleRate) setSampleRate(item.sampleRate);
    if (item.channels) setChannels(item.channels);
    if (item.masteringPreset) setMasteringPreset(item.masteringPreset);
    if (item.customVoiceDescription) {
      setVoiceDesignMode('custom');
      setCustomVoiceDescription(item.customVoiceDescription);
    } else {
      setVoiceDesignMode('prebuilt');
    }
    if (item.mode === 'multi' && item.dialogueLines && item.speakers) {
      setDialogueLines(item.dialogueLines);
      setSpeakers(item.speakers);
    } else {
      setText(item.fullText);
    }
    setActiveTab('studio');
  };

  const activePronunciationCount = pronunciations.filter((p) => p.enabled).length;

  const breadcrumbLabel =
    activeTab === 'studio'
      ? mode === 'multi'
        ? 'Studio / Multi-Speaker'
        : 'Studio / Speech Synthesis'
      : activeTab === 'voices'
        ? 'Library / English & Hindi Voices'
        : activeTab === 'history'
          ? 'Archive / Generation History'
          : 'Integrations / ChatGPT & Claude MCP';

  const pageTitle =
    activeTab === 'studio'
      ? 'Text to Speech Studio'
      : activeTab === 'voices'
        ? 'Voice Library'
        : activeTab === 'history'
          ? 'Generation History'
          : 'MCP Connectors';

  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-[#F8FAFC] dark:bg-[#090D16] text-[#0F172A] dark:text-slate-100">
      <div className="flex flex-1 min-h-0">
        <SidebarNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          historyCount={history.length}
          voiceCount={VOICE_PRESETS.length}
          activeLanguage={language}
          onQuickSelectLanguage={(lang) => {
            setLanguage(lang);
            setActiveTab('studio');
          }}
        />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top Bar */}
          <header className="h-14 px-4 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-md bg-[#0F172A] dark:bg-[#2563EB] text-white flex items-center justify-center">
                  <AudioWaveform className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-sm text-[#0F172A] dark:text-slate-100 whitespace-nowrap">
                  Svara
                </span>
              </div>
              <span className="hidden lg:inline text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap truncate">
                {breadcrumbLabel}
              </span>
            </div>

            {/* Mobile inline nav links */}
            <nav className="flex lg:hidden items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setActiveTab('studio')}
                className={`whitespace-nowrap shrink-0 ${
                  activeTab === 'studio'
                    ? 'text-[#0F172A] dark:text-white underline underline-offset-4'
                    : ''
                }`}
              >
                Studio
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('voices')}
                className={`whitespace-nowrap shrink-0 ${
                  activeTab === 'voices'
                    ? 'text-[#0F172A] dark:text-white underline underline-offset-4'
                    : ''
                }`}
              >
                Voices
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`whitespace-nowrap shrink-0 ${
                  activeTab === 'history'
                    ? 'text-[#0F172A] dark:text-white underline underline-offset-4'
                    : ''
                }`}
              >
                History
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mcp')}
                className={`whitespace-nowrap shrink-0 ${
                  activeTab === 'mcp'
                    ? 'text-[#0F172A] dark:text-white underline underline-offset-4'
                    : ''
                }`}
              >
                MCP
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsDark((prev) => !prev)}
                aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleResetScript}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Script</span>
              </button>
            </div>
          </header>

          {/* Main Workspace Scroll Region */}
          <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
            <div className="max-w-7xl mx-auto space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] dark:text-slate-100">
                    {pageTitle}
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {activeTab === 'studio'
                      ? 'Synthesize expressive speech in English, हिन्दी (Hindi), and Hinglish with custom pronunciations, 48 kHz WAV mastering, and word-level captions.'
                      : activeTab === 'voices'
                        ? 'Explore curated English, Hindi, and bilingual voices—preview samples live or open directly in the studio.'
                        : activeTab === 'history'
                          ? 'Replay, restore, or download your synthesized .WAV audio files and .SRT / .ASS captions.'
                          : 'Connect ChatGPT and Claude directly to Svara Studio over Model Context Protocol (/mcp).'}
                  </p>
                </div>
              </div>

              {activeTab === 'studio' && (
                <SpeechStudio
                  mode={mode}
                  onModeChange={setMode}
                  language={language}
                  onLanguageChange={setLanguage}
                  selectedVoice={selectedVoice}
                  onSelectVoiceById={handleSelectVoiceById}
                  onOpenVoiceLibrary={() => setActiveTab('voices')}
                  voiceDesignMode={voiceDesignMode}
                  onVoiceDesignModeChange={setVoiceDesignMode}
                  customVoiceDescription={customVoiceDescription}
                  onCustomVoiceDescriptionChange={setCustomVoiceDescription}
                  stylePrompt={stylePrompt}
                  onStylePromptChange={setStylePrompt}
                  speed={speed}
                  onSpeedChange={setSpeed}
                  pitchRegister={pitchRegister}
                  onPitchRegisterChange={setPitchRegister}
                  emotionIntensity={emotionIntensity}
                  onEmotionIntensityChange={setEmotionIntensity}
                  engineTier={engineTier}
                  onEngineTierChange={setEngineTier}
                  sampleRate={sampleRate}
                  onSampleRateChange={setSampleRate}
                  channels={channels}
                  onChannelsChange={setChannels}
                  masteringPreset={masteringPreset}
                  onMasteringPresetChange={setMasteringPreset}
                  normalizeAudio={normalizeAudio}
                  onNormalizeAudioChange={setNormalizeAudio}
                  targetDurationSec={targetDurationSec}
                  onTargetDurationSecChange={setTargetDurationSec}
                  savedPresets={savedPresets}
                  onApplySavedPreset={handleApplySavedPreset}
                  onSaveCurrentPreset={handleSaveCurrentPreset}
                  activePronunciationCount={activePronunciationCount}
                  onOpenPronunciationModal={() => setIsPronunciationModalOpen(true)}
                  text={text}
                  onTextChange={setText}
                  speakers={speakers}
                  onSpeakersChange={setSpeakers}
                  dialogueLines={dialogueLines}
                  onDialogueLinesChange={setDialogueLines}
                  latestResult={latestResult}
                  regeneratingSegIdx={regeneratingSegIdx}
                  onRegenerateSegment={handleRegenerateSegment}
                  isGenerating={isGenerating}
                  errorMessage={errorMessage}
                  onDismissError={() => setErrorMessage(null)}
                  onGenerate={handleGenerate}
                />
              )}

              {activeTab === 'voices' && (
                <>
                  {errorMessage && (
                    <div
                      role="alert"
                      className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 text-sm flex items-center justify-between gap-3"
                    >
                      <span>{errorMessage}</span>
                      <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  <VoiceLibrary
                    selectedVoiceId={selectedVoiceId}
                    previewingVoiceId={previewingVoiceId}
                    onPreviewVoice={handlePreviewVoice}
                    onUseInStudio={handleUseVoiceInStudio}
                  />
                </>
              )}

              {activeTab === 'history' && (
                <HistoryPanel
                  items={history}
                  activeTrackId={activeTrack?.id ?? null}
                  onPlayItem={handlePlayHistoryItem}
                  onRestoreToStudio={handleRestoreToStudio}
                  onDeleteItem={(id) =>
                    setHistory((prev) => prev.filter((item) => item.id !== id))
                  }
                  onClearAll={() => setHistory([])}
                  onGoToStudio={() => setActiveTab('studio')}
                />
              )}

              {activeTab === 'mcp' && <McpConnectPanel serverAppUrl={serverAppUrl} />}
            </div>
          </main>

          <AudioPlayerBar
            track={activeTrack}
            isGenerating={isGenerating || previewingVoiceId !== null}
            isDark={isDark}
            onPlaybackError={setErrorMessage}
          />
        </div>
      </div>

      <PronunciationModal
        isOpen={isPronunciationModalOpen}
        entries={pronunciations}
        onClose={() => setIsPronunciationModalOpen(false)}
        onSaveEntry={handleSavePronunciation}
        onToggleEntry={handleTogglePronunciation}
        onDeleteEntry={handleDeletePronunciation}
      />
    </div>
  );
}
