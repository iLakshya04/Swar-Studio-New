import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Captions,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  BACKCHANNEL_TAGS,
  EMOTION_CUES,
  SAMPLE_TEMPLATES,
  TONE_PRESETS,
  VOCAL_TAGS,
  VOICE_PRESETS,
} from '../data/voices';
import type {
  ChannelCount,
  DialogueLine,
  EmotionIntensity,
  EngineTier,
  GenerateResponsePayload,
  LanguageMode,
  MasteringPreset,
  PitchRegister,
  SampleRateHz,
  SavedVoicePresetConfig,
  SpeakerConfig,
  StudioMode,
  SubtitleFormat,
  VoicePreset,
} from '../types';
import {
  countWordsAndChars,
  detectScriptLanguage,
  insertVocalTagAtCursor,
} from '../utils/speechLogic';
import { generateSubtitles } from '../utils/subtitleGenerator';
import type { ActiveTrack } from './AudioPlayerBar';
import { InteractiveWaveform } from './InteractiveWaveform';
import { VoiceAvatar } from './VoiceAvatar';

interface SpeechStudioProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  language: LanguageMode;
  onLanguageChange: (lang: LanguageMode) => void;
  selectedVoice: VoicePreset;
  onSelectVoiceById: (id: string) => void;
  onOpenVoiceLibrary: () => void;
  voiceDesignMode: 'prebuilt' | 'custom';
  onVoiceDesignModeChange: (mode: 'prebuilt' | 'custom') => void;
  customVoiceDescription: string;
  onCustomVoiceDescriptionChange: (val: string) => void;
  stylePrompt: string;
  onStylePromptChange: (val: string) => void;
  speed: number;
  onSpeedChange: (val: number) => void;
  pitchRegister: PitchRegister;
  onPitchRegisterChange: (val: PitchRegister) => void;
  emotionIntensity: EmotionIntensity;
  onEmotionIntensityChange: (val: EmotionIntensity) => void;
  engineTier: EngineTier;
  onEngineTierChange: (tier: EngineTier) => void;
  sampleRate: SampleRateHz;
  onSampleRateChange: (rate: SampleRateHz) => void;
  channels: ChannelCount;
  onChannelsChange: (ch: ChannelCount) => void;
  masteringPreset: MasteringPreset;
  onMasteringPresetChange: (preset: MasteringPreset) => void;
  normalizeAudio: boolean;
  onNormalizeAudioChange: (val: boolean) => void;
  targetDurationSec: string;
  onTargetDurationSecChange: (val: string) => void;
  savedPresets: SavedVoicePresetConfig[];
  onApplySavedPreset: (presetId: string) => void;
  onSaveCurrentPreset: (name: string) => Promise<void> | void;
  activePronunciationCount: number;
  onOpenPronunciationModal: () => void;
  text: string;
  onTextChange: (val: string) => void;
  speakers: { A: SpeakerConfig; B: SpeakerConfig };
  onSpeakersChange: (next: { A: SpeakerConfig; B: SpeakerConfig }) => void;
  dialogueLines: DialogueLine[];
  onDialogueLinesChange: (lines: DialogueLine[]) => void;
  latestResult: GenerateResponsePayload | null;
  activeTrack: ActiveTrack | null;
  playbackCurrentTime: number;
  playbackDuration: number;
  isPlaying: boolean;
  hasAudio: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number, autoPlay?: boolean) => void;
  regeneratingSegIdx: number | null;
  onRegenerateSegment: (segmentIndex: number, nextText: string) => Promise<void> | void;
  isGenerating: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
  onGenerate: () => void;
}

export function SpeechStudio({
  mode,
  onModeChange,
  language,
  onLanguageChange,
  selectedVoice,
  onSelectVoiceById,
  onOpenVoiceLibrary,
  voiceDesignMode,
  onVoiceDesignModeChange,
  customVoiceDescription,
  onCustomVoiceDescriptionChange,
  stylePrompt,
  onStylePromptChange,
  speed,
  onSpeedChange,
  pitchRegister,
  onPitchRegisterChange,
  emotionIntensity,
  onEmotionIntensityChange,
  engineTier,
  onEngineTierChange,
  sampleRate,
  onSampleRateChange,
  channels,
  onChannelsChange,
  masteringPreset,
  onMasteringPresetChange,
  normalizeAudio,
  onNormalizeAudioChange,
  targetDurationSec,
  onTargetDurationSecChange,
  savedPresets,
  onApplySavedPreset,
  onSaveCurrentPreset,
  activePronunciationCount,
  onOpenPronunciationModal,
  text,
  onTextChange,
  speakers,
  onSpeakersChange,
  dialogueLines,
  onDialogueLinesChange,
  latestResult,
  activeTrack,
  playbackCurrentTime,
  playbackDuration,
  isPlaying,
  hasAudio,
  onTogglePlay,
  onSeek,
  regeneratingSegIdx,
  onRegenerateSegment,
  isGenerating,
  errorMessage,
  onDismissError,
  onGenerate,
}: SpeechStudioProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [segmentEdits, setSegmentEdits] = useState<Record<number, string>>({});

  const combinedDialogueText = dialogueLines.map((l) => l.text).join(' ');
  const activeTextForStats = mode === 'single' ? text : combinedDialogueText;
  const stats = countWordsAndChars(activeTextForStats);
  const detectedLang = detectScriptLanguage(activeTextForStats);

  const handleInsertTag = (tag: string) => {
    if (mode === 'single') {
      const el = textareaRef.current;
      const start = el ? el.selectionStart : text.length;
      const end = el ? el.selectionEnd : text.length;
      const { nextText, nextCursor } = insertVocalTagAtCursor(text, tag, start, end);
      onTextChange(nextText);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      });
    } else {
      const targetId = activeLineId || dialogueLines[dialogueLines.length - 1]?.id;
      if (!targetId) return;
      onDialogueLinesChange(
        dialogueLines.map((line) =>
          line.id === targetId
            ? { ...line, text: `${line.text.trimEnd()}${line.text.trim() ? ' ' : ''}${tag}` }
            : line
        )
      );
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const tpl = SAMPLE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    onModeChange('single');
    onLanguageChange(tpl.language);
    onSelectVoiceById(tpl.voiceId);
    onStylePromptChange(tpl.stylePrompt);
    onTextChange(tpl.text);
    onDismissError();
    setTranslateError(null);
  };

  const handleTranslateScript = async (target: 'en' | 'hi' | 'bilingual') => {
    if (mode !== 'single' || !text.trim() || isTranslating) return;
    setIsTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch('/api/script/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: target }),
      });
      const data = (await res.json()) as { translatedText?: string; error?: string };
      if (!res.ok || !data.translatedText) {
        throw new Error(data.error || 'Could not translate script.');
      }
      onTextChange(data.translatedText);
      onLanguageChange(target);
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAddDialogueLine = () => {
    const last = dialogueLines[dialogueLines.length - 1];
    const nextSpeaker: 'A' | 'B' = last?.speakerKey === 'A' ? 'B' : 'A';
    onDialogueLinesChange([
      ...dialogueLines,
      {
        id: `line-${Date.now()}`,
        speakerKey: nextSpeaker,
        text: '',
      },
    ]);
  };

  const handleRemoveDialogueLine = (id: string) => {
    if (dialogueLines.length <= 1) return;
    onDialogueLinesChange(dialogueLines.filter((line) => line.id !== id));
  };

  const handleUpdateDialogueLine = (id: string, updates: Partial<DialogueLine>) => {
    onDialogueLinesChange(
      dialogueLines.map((line) => (line.id === id ? { ...line, ...updates } : line))
    );
  };

  const updateSpeaker = (key: 'A' | 'B', voiceId: string) => {
    const preset = VOICE_PRESETS.find((v) => v.id === voiceId);
    if (!preset) return;
    onSpeakersChange({
      ...speakers,
      [key]: {
        ...speakers[key],
        voiceId: preset.id,
        baseVoice: preset.baseVoice,
        style: preset.defaultStyle,
      },
    });
  };

  const handleDownloadSubtitles = (format: SubtitleFormat) => {
    if (!latestResult?.wordTimings?.length) return;
    const subContent = generateSubtitles({
      wordTimings: latestResult.wordTimings,
      format,
      preset: 'rainbow_reels',
    });
    const blob = new Blob([subContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `svara-${latestResult.clipId || 'captions'}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {(errorMessage || translateError) && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 text-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage || translateError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onDismissError();
              setTranslateError(null);
            }}
            className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div
          className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 self-start"
          role="tablist"
          aria-label="Synthesis mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            onClick={() => onModeChange('single')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
              mode === 'single'
                ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-100'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Single Voice</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'multi'}
            onClick={() => onModeChange('multi')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
              mode === 'multi'
                ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Multi-Speaker Dialogue</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Sample scripts:
          </span>
          {SAMPLE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleApplyTemplate(tpl.id)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Script Workbench */}
        <div className="xl:col-span-8 space-y-4">
          <section
            aria-label="Script editor"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col"
          >
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-0.5 whitespace-nowrap">
                  Tags:
                </span>
                {VOCAL_TAGS.map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    title={item.hint}
                    onClick={() => handleInsertTag(item.tag)}
                    className="px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    {item.tag}
                  </button>
                ))}
                {mode === 'single' &&
                  EMOTION_CUES.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      title={item.hint}
                      onClick={() => handleInsertTag(item.tag)}
                      className="inline-flex px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-mono text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      {item.tag}
                    </button>
                  ))}
                {mode === 'multi' &&
                  BACKCHANNEL_TAGS.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      title={item.hint}
                      onClick={() => handleInsertTag(item.tag)}
                      className="px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      {item.label}
                    </button>
                  ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenPronunciationModal}
                  data-testid="open-pronunciation-modal"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Pronunciation ({activePronunciationCount})</span>
                </button>

                {mode === 'single' && (
                  <div className="flex items-center gap-1">
                    <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                    <button
                      type="button"
                      disabled={isTranslating || !text.trim()}
                      onClick={() => handleTranslateScript('hi')}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      {isTranslating ? 'Adapting...' : 'To Hindi'}
                    </button>
                    <button
                      type="button"
                      disabled={isTranslating || !text.trim()}
                      onClick={() => handleTranslateScript('en')}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      To English
                    </button>
                    <button
                      type="button"
                      disabled={isTranslating || !text.trim()}
                      onClick={() => handleTranslateScript('bilingual')}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      To Hinglish
                    </button>
                  </div>
                )}
              </div>
            </div>

            {mode === 'single' ? (
              <div className="p-5">
                <label htmlFor="studio-script-input" className="sr-only">
                  Speech script in English or Hindi
                </label>
                <textarea
                  id="studio-script-input"
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  rows={7}
                  placeholder="Type or paste your script in English, हिन्दी (Hindi Devanagari), or Hinglish. Insert vocal tags like <breath> or emotion cues like [CURIOUS] or [AWE]..."
                  className="w-full resize-y min-h-[168px] text-[16px] leading-[1.7] text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {dialogueLines.map((line, index) => {
                  const activeSpeaker = line.speakerKey === 'A' ? speakers.A : speakers.B;
                  return (
                    <div key={line.id} className="px-5 py-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono tabular-nums text-slate-400">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateDialogueLine(line.id, { speakerKey: 'A' })}
                              className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                                line.speakerKey === 'A'
                                  ? 'bg-[#0F172A] dark:bg-white text-white dark:text-[#0F172A]'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                              }`}
                            >
                              {speakers.A.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDialogueLine(line.id, { speakerKey: 'B' })}
                              className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                                line.speakerKey === 'B'
                                  ? 'bg-[#2563EB] text-white'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                              }`}
                            >
                              {speakers.B.name}
                            </button>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {activeSpeaker.baseVoice}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={dialogueLines.length <= 1}
                          onClick={() => handleRemoveDialogueLine(line.id)}
                          aria-label={`Remove dialogue line ${index + 1}`}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-30 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        aria-label={`Dialogue line ${index + 1} for ${activeSpeaker.name}`}
                        value={line.text}
                        onFocus={() => setActiveLineId(line.id)}
                        onChange={(e) =>
                          handleUpdateDialogueLine(line.id, { text: e.target.value })
                        }
                        rows={3}
                        placeholder={`Write ${activeSpeaker.name}'s line in English or हिन्दी...`}
                        className="w-full resize-y bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-[15px] leading-relaxed text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  );
                })}
                <div className="px-5 py-3">
                  <button
                    type="button"
                    onClick={handleAddDialogueLine}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Dialogue Turn</span>
                  </button>
                </div>
              </div>
            )}

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/40 rounded-b-xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>{stats.chars.toLocaleString()} chars</span>
                <span aria-hidden="true">·</span>
                <span>{stats.words.toLocaleString()} words</span>
                <span aria-hidden="true">·</span>
                <span>~{stats.estimatedSeconds}s est.</span>
                {mode === 'single' && stats.chars > 3500 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Auto-chunked synthesis</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  Detected:{' '}
                  {detectedLang === 'hi'
                    ? 'Hindi (हिन्दी)'
                    : detectedLang === 'bilingual'
                      ? 'Bilingual (EN + HI)'
                      : 'English'}
                </span>
              </div>

              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating}
                className="inline-flex items-center justify-center gap-2 px-5 h-10 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-blue-700 disabled:bg-blue-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Audio...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Speech</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Interactive Waveform & Word-Timing Offset Inspector */}
          {(latestResult || activeTrack) &&
          ((activeTrack?.wordTimings?.length ?? latestResult?.wordTimings?.length ?? 0) > 0 ||
            (activeTrack?.waveformPeaks?.length ?? latestResult?.waveformPeaks?.length ?? 0) > 0) ? (
            <InteractiveWaveform
              title={activeTrack?.title}
              wordTimings={
                activeTrack?.wordTimings?.length
                  ? activeTrack.wordTimings
                  : latestResult?.wordTimings ?? []
              }
              waveformPeaks={
                activeTrack?.waveformPeaks?.length
                  ? activeTrack.waveformPeaks
                  : latestResult?.waveformPeaks
              }
              durationSec={
                playbackDuration > 0
                  ? playbackDuration
                  : activeTrack?.durationSec ||
                    (latestResult?.durationMs
                      ? latestResult.durationMs / 1000
                      : latestResult?.durationEstimateSec || 0)
              }
              currentTime={playbackCurrentTime}
              isPlaying={isPlaying}
              hasAudio={hasAudio}
              onTogglePlay={onTogglePlay}
              onSeek={onSeek}
            />
          ) : null}

          {/* Captions & Segment Timeline Panel (visible once a clip with wordTimings is generated) */}
          {latestResult && (latestResult.wordTimings?.length || latestResult.segments?.length) ? (
            <section
              aria-label="Captions and segment timeline"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                    Word Timings &amp; Subtitle Exports
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {latestResult.wordTimings?.length || 0} aligned words ·{' '}
                    {latestResult.durationMs
                      ? `${(latestResult.durationMs / 1000).toFixed(2)}s`
                      : `${latestResult.durationEstimateSec}s`}
                    {latestResult.appliedPronunciations?.length
                      ? ` · Pronunciations applied: ${latestResult.appliedPronunciations.join(', ')}`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownloadSubtitles('ass')}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    <Captions className="w-3.5 h-3.5" />
                    <span>Rainbow Reels .ASS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadSubtitles('srt')}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    .SRT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadSubtitles('vtt')}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    .VTT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadSubtitles('json')}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Word JSON
                  </button>
                </div>
              </div>

              {latestResult.segments && latestResult.segments.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {latestResult.segments.map((seg) => {
                    const draftText = segmentEdits[seg.index] ?? seg.text;
                    const isRegening = regeneratingSegIdx === seg.index;
                    return (
                      <div
                        key={`${seg.clipId}-${seg.index}`}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            <span>#{seg.index + 1}</span>
                            {seg.emotion && (
                              <span className="text-[#2563EB] dark:text-blue-400">
                                [{seg.emotion}]
                              </span>
                            )}
                            <span>
                              {(seg.startMs / 1000).toFixed(2)}s–{(seg.endMs / 1000).toFixed(2)}s
                            </span>
                          </div>
                          <input
                            type="text"
                            aria-label={`Edit segment ${seg.index + 1}`}
                            value={draftText}
                            onChange={(e) =>
                              setSegmentEdits((prev) => ({
                                ...prev,
                                [seg.index]: e.target.value,
                              }))
                            }
                            className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={isRegening || isGenerating}
                          onClick={() => onRegenerateSegment(seg.index, draftText)}
                          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 self-end sm:self-center"
                        >
                          {isRegening ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          <span>{isRegening ? 'Regenerating...' : 'Regenerate Line'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </div>

        {/* Right Voice & Delivery Inspector */}
        <aside
          aria-label="Voice and delivery settings"
          className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5"
        >
          {/* Saved Voice Presets Bar */}
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="saved-preset-select"
                className="text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Saved Voice Presets
              </label>
              <button
                type="button"
                onClick={() => setShowPresetForm((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>{showPresetForm ? 'Cancel' : 'Save Current'}</span>
              </button>
            </div>
            <select
              id="saved-preset-select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onApplySavedPreset(e.target.value);
              }}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">Load a creator preset...</option>
              {savedPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {showPresetForm && (
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  aria-label="New voice preset name"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Preset name (e.g. Science Reel)"
                  className="flex-1 h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!newPresetName.trim()) return;
                    await onSaveCurrentPreset(newPresetName.trim());
                    setNewPresetName('');
                    setShowPresetForm(false);
                  }}
                  className="px-3 h-8 rounded-md bg-[#2563EB] text-white text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {mode === 'single' ? (
            <>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                    Voice Configuration
                  </h2>
                  <button
                    type="button"
                    onClick={onOpenVoiceLibrary}
                    className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    Browse All ({VOICE_PRESETS.length})
                  </button>
                </div>

                <div
                  className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  role="group"
                  aria-label="Voice source mode"
                >
                  <button
                    type="button"
                    onClick={() => onVoiceDesignModeChange('prebuilt')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      voiceDesignMode === 'prebuilt'
                        ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                    }`}
                  >
                    Prebuilt Persona
                  </button>
                  <button
                    type="button"
                    onClick={() => onVoiceDesignModeChange('custom')}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      voiceDesignMode === 'custom'
                        ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                    }`}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Custom Design</span>
                  </button>
                </div>

                {voiceDesignMode === 'prebuilt' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 pt-0.5">
                      <VoiceAvatar
                        src={selectedVoice.portraitUrl}
                        name={selectedVoice.name}
                        sizeClass="w-10 h-10"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#0F172A] dark:text-slate-100 truncate">
                          {selectedVoice.name} · {selectedVoice.roleTitle}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {selectedVoice.language} · {selectedVoice.accent}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="voice-preset-select"
                        className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Select Persona
                      </label>
                      <select
                        id="voice-preset-select"
                        value={selectedVoice.id}
                        onChange={(e) => onSelectVoiceById(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                      >
                        {VOICE_PRESETS.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} — {v.roleTitle} ({v.language})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label
                      htmlFor="custom-voice-prompt"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Describe Custom Voice Persona
                    </label>
                    <textarea
                      id="custom-voice-prompt"
                      value={customVoiceDescription}
                      onChange={(e) => onCustomVoiceDescriptionChange(e.target.value)}
                      rows={3}
                      placeholder="e.g., A deep, curious Hindi science documentary narrator with crisp pacing..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB]"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Paired with base timbre{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {selectedVoice.baseVoice}
                      </span>
                      .
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label
                  htmlFor="delivery-style-input"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Delivery &amp; Tone Direction
                </label>
                <input
                  id="delivery-style-input"
                  type="text"
                  value={stylePrompt}
                  onChange={(e) => onStylePromptChange(e.target.value)}
                  placeholder="Smooth and unhurried, clear pronunciation..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {TONE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onStylePromptChange(preset)}
                      className={`px-2 py-1 rounded-md border text-[11px] transition-colors whitespace-nowrap ${
                        stylePrompt === preset
                          ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400 font-medium'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                Dual-Speaker Cast
              </h2>
              {(['A', 'B'] as const).map((key) => {
                const sp = speakers[key];
                return (
                  <div
                    key={key}
                    className="pt-3 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-0 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Speaker {key}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        Base: {sp.baseVoice}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor={`speaker-${key}-name`}
                          className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Name
                        </label>
                        <input
                          id={`speaker-${key}-name`}
                          type="text"
                          value={sp.name}
                          onChange={(e) =>
                            onSpeakersChange({
                              ...speakers,
                              [key]: { ...sp, name: e.target.value },
                            })
                          }
                          className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`speaker-${key}-voice`}
                          className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Persona
                        </label>
                        <select
                          id={`speaker-${key}-voice`}
                          value={sp.voiceId}
                          onChange={(e) => updateSpeaker(key, e.target.value)}
                          className="w-full h-9 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                        >
                          {VOICE_PRESETS.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.language})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor={`speaker-${key}-style`}
                        className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                      >
                        Role Style
                      </label>
                      <input
                        id={`speaker-${key}-style`}
                        type="text"
                        value={sp.style}
                        onChange={(e) =>
                          onSpeakersChange({
                            ...speakers,
                            [key]: { ...sp, style: e.target.value },
                          })
                        }
                        className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tone & Speed Controls */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Vocal Register
                </span>
                <div
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  role="group"
                  aria-label="Vocal pitch register"
                >
                  {(['deep', 'balanced', 'bright'] as const).map((reg) => (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => onPitchRegisterChange(reg)}
                      className={`py-1.5 px-2 text-xs font-medium rounded-md capitalize transition-colors ${
                        pitchRegister === reg
                          ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                      }`}
                    >
                      {reg}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Expressiveness
                </span>
                <div
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  role="group"
                  aria-label="Emotion intensity"
                >
                  {(['subtle', 'natural', 'dramatic'] as const).map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => onEmotionIntensityChange(emo)}
                      className={`py-1.5 px-2 text-xs font-medium rounded-md capitalize transition-colors ${
                        emotionIntensity === emo
                          ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                      }`}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="speech-speed-slider"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Speech Speed
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tabular-nums font-medium text-[#0F172A] dark:text-slate-100">
                    {speed.toFixed(2)}x
                  </span>
                  {speed !== 1.0 && (
                    <button
                      type="button"
                      onClick={() => onSpeedChange(1.0)}
                      className="text-[11px] text-[#2563EB] dark:text-blue-400 hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <input
                id="speech-speed-slider"
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={speed}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
                className="w-full accent-[#2563EB] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-400">
                <span>0.70x Slow</span>
                <span>1.00x</span>
                <span>1.40x Fast</span>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Language Pronunciation Target
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'en', label: 'English' },
                    { id: 'hi', label: 'हिन्दी (Hindi)' },
                    { id: 'bilingual', label: 'Bilingual' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onLanguageChange(item.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      language === item.id
                        ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* WAV Mastering & Export Settings */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  WAV Mastering &amp; Timing
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {(sampleRate / 1000).toFixed(sampleRate === 44100 ? 1 : 0)} kHz ·{' '}
                  {channels === 2 ? 'Stereo' : 'Mono'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="wav-samplerate-select"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Sample Rate
                  </label>
                  <select
                    id="wav-samplerate-select"
                    value={sampleRate}
                    onChange={(e) => onSampleRateChange(Number(e.target.value) as SampleRateHz)}
                    className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value={48000}>48 kHz (Video Default)</option>
                    <option value={44100}>44.1 kHz (CD/Audio)</option>
                    <option value={24000}>24 kHz (Native Fast)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="wav-channels-select"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Channels
                  </label>
                  <select
                    id="wav-channels-select"
                    value={channels}
                    onChange={(e) => onChannelsChange(Number(e.target.value) as ChannelCount)}
                    className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value={1}>Mono (1ch)</option>
                    <option value={2}>Stereo (2ch)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="mastering-preset-select"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Mastering Preset
                  </label>
                  <select
                    id="mastering-preset-select"
                    value={masteringPreset}
                    onChange={(e) => onMasteringPresetChange(e.target.value as MasteringPreset)}
                    className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="none">Clean Studio</option>
                    <option value="instagram_reel">Instagram Reel</option>
                    <option value="youtube_narration">YouTube Narration</option>
                    <option value="podcast">Podcast Warmth</option>
                    <option value="audiobook">Audiobook</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="target-duration-input"
                    className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Target Duration (sec)
                  </label>
                  <input
                    id="target-duration-input"
                    type="number"
                    min={1}
                    max={1800}
                    step={0.5}
                    value={targetDurationSec}
                    onChange={(e) => onTargetDurationSecChange(e.target.value)}
                    placeholder="Auto"
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={normalizeAudio}
                    onChange={(e) => onNormalizeAudioChange(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 accent-[#2563EB]"
                  />
                  <span>Normalize &amp; trim silence</span>
                </label>

                <select
                  id="engine-tier-select"
                  aria-label="Synthesis Engine"
                  value={engineTier}
                  onChange={(e) => onEngineTierChange(e.target.value as EngineTier)}
                  className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="standard">Flash Lite (High Quota)</option>
                  <option value="expressive">Flash Expressive</option>
                </select>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
