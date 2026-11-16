import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Languages,
  Loader2,
  Plus,
  Trash2,
  Users,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  BACKCHANNEL_TAGS,
  SAMPLE_TEMPLATES,
  TONE_PRESETS,
  VOCAL_TAGS,
  VOICE_PRESETS,
} from '../data/voices';
import type {
  DialogueLine,
  EmotionIntensity,
  EngineTier,
  LanguageMode,
  PitchRegister,
  SpeakerConfig,
  StudioMode,
  VoicePreset,
} from '../types';
import {
  countWordsAndChars,
  detectScriptLanguage,
  insertVocalTagAtCursor,
} from '../utils/speechLogic';
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
  text: string;
  onTextChange: (val: string) => void;
  speakers: { A: SpeakerConfig; B: SpeakerConfig };
  onSpeakersChange: (next: { A: SpeakerConfig; B: SpeakerConfig }) => void;
  dialogueLines: DialogueLine[];
  onDialogueLinesChange: (lines: DialogueLine[]) => void;
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
  text,
  onTextChange,
  speakers,
  onSpeakersChange,
  dialogueLines,
  onDialogueLinesChange,
  isGenerating,
  errorMessage,
  onDismissError,
  onGenerate,
}: SpeechStudioProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

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
        <section
          aria-label="Script editor"
          className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col"
        >
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1 whitespace-nowrap">
                Tags:
              </span>
              {VOCAL_TAGS.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  title={item.hint}
                  onClick={() => handleInsertTag(item.tag)}
                  className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
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
                    className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    {item.label}
                  </button>
                ))}
            </div>

            {mode === 'single' && (
              <div className="flex items-center gap-1">
                <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-0.5" />
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
                rows={10}
                maxLength={4000}
                placeholder="Type or paste your script in English, हिन्दी (Hindi Devanagari), or Hinglish. Insert vocal tags like <breath> or <laugh> anywhere..."
                className="w-full resize-y min-h-[260px] text-[16px] leading-[1.7] text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-transparent focus:outline-none"
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
              <span>{stats.chars} / 4,000 chars</span>
              <span aria-hidden="true">·</span>
              <span>{stats.words} words</span>
              <span aria-hidden="true">·</span>
              <span>~{stats.estimatedSeconds}s est.</span>
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

        {/* Right Voice & Delivery Inspector */}
        <aside
          aria-label="Voice and delivery settings"
          className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3.5"
        >
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
                    Browse All Voices
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
                      placeholder="e.g., A laid-back late-night Mumbai radio RJ with a warm baritone, or a crisp Hindi documentary narrator..."
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Vocal Register
                </span>
                <div
                  className="grid grid-cols-3 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  role="group"
                  aria-label="Vocal pitch register"
                >
                  {(['deep', 'balanced', 'bright'] as const).map((reg) => (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => onPitchRegisterChange(reg)}
                      className={`py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
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
                  className="grid grid-cols-3 gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  role="group"
                  aria-label="Emotion intensity"
                >
                  {(['subtle', 'natural', 'dramatic'] as const).map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => onEmotionIntensityChange(emo)}
                      className={`py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
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

            <div className="grid grid-cols-1 gap-2.5">
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

              <div>
                <label
                  htmlFor="engine-tier-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Synthesis Engine
                </label>
                <select
                  id="engine-tier-select"
                  value={mode === 'multi' ? 'expressive' : engineTier}
                  disabled={mode === 'multi'}
                  onChange={(e) => onEngineTierChange(e.target.value as EngineTier)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-slate-900 focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="standard">Flash Lite (Fast)</option>
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
