export type LanguageMode = 'en' | 'hi' | 'bilingual';
export type StudioMode = 'single' | 'multi';
export type EngineTier = 'standard' | 'expressive';
export type PrebuiltVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
export type PitchRegister = 'deep' | 'balanced' | 'bright';
export type EmotionIntensity = 'subtle' | 'natural' | 'dramatic';

export type AudioFormat = 'wav' | 'mp3' | 'm4a' | 'flac';
export type SampleRateHz = 24000 | 44100 | 48000;
export type ChannelCount = 1 | 2;
export type MasteringPreset =
  | 'none'
  | 'youtube_narration'
  | 'instagram_reel'
  | 'podcast'
  | 'audiobook';
export type FitMode = 'natural' | 'tight' | 'stretch';
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'json';
export type SubtitlePreset = 'rainbow_reels' | 'clean_editorial';

export type VoiceCategory =
  | 'Narration'
  | 'Conversational'
  | 'Characters'
  | 'News & Anchor'
  | 'Wellness';

export interface VoicePreset {
  id: string;
  name: string;
  roleTitle: string;
  baseVoice: PrebuiltVoiceName;
  language: 'English' | 'Hindi' | 'Bilingual';
  category: VoiceCategory;
  gender: 'Male' | 'Female' | 'Neutral';
  accent: string;
  description: string;
  defaultStyle: string;
  sampleText: string;
  sampleLanguage: LanguageMode;
  portraitUrl?: string;
}

export interface PronunciationEntry {
  id: string;
  term: string;
  phonetic: string;
  ipa?: string;
  language: LanguageMode;
  notes?: string;
  enabled: boolean;
  createdAt: string;
}

export interface ExpressiveControls {
  energy?: number; // 0..100
  warmth?: number; // 0..100
  authority?: number; // 0..100
  curiosity?: number; // 0..100
  dramaticTension?: number; // 0..100
  pace?: number; // 0..100
  pauseStrength?: number; // 0..100
  smile?: number; // 0..100
  whisper?: number; // 0..100
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  startSeconds: number;
  endSeconds: number;
  segmentIndex?: number;
  emotion?: string;
}

export interface PhraseTiming {
  text: string;
  startMs: number;
  endMs: number;
  words: WordTiming[];
}

export interface SpeechEnvelopeInterval {
  startMs: number;
  endMs: number;
  speechActive: boolean;
  rmsDb: number;
  duckGainDb: number;
}

export interface SpeechSegmentMeta {
  index: number;
  text: string;
  emotion?: string;
  clipId: string;
  audioUrl: string;
  durationMs: number;
  startMs: number;
  endMs: number;
}

export interface DialogueLine {
  id: string;
  speakerKey: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  text: string;
  emotion?: string;
}

export interface SpeakerConfig {
  id?: string;
  name: string;
  voiceId: string;
  baseVoice: PrebuiltVoiceName;
  style: string;
}

export interface AudioExportConfig {
  format?: AudioFormat;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  bitrateKbps?: number;
  normalize?: boolean;
  trimSilence?: boolean;
  masteringPreset?: MasteringPreset;
}

export interface GenerateRequestPayload extends AudioExportConfig {
  mode: StudioMode;
  language: LanguageMode;
  modelTier: EngineTier;
  text: string;
  voiceName: PrebuiltVoiceName;
  voiceId?: string;
  stylePrompt: string;
  customVoiceDescription?: string;
  speed: number;
  pitchRegister?: PitchRegister;
  emotionIntensity?: EmotionIntensity;
  expressiveControls?: ExpressiveControls;
  seed?: number;
  targetDurationSeconds?: number;
  durationToleranceSeconds?: number;
  fitMode?: FitMode;
  applyPronunciations?: boolean;
  pronunciationRules?: PronunciationEntry[];
  speakers?: {
    A: SpeakerConfig;
    B: SpeakerConfig;
    [key: string]: SpeakerConfig;
  };
  speakerList?: SpeakerConfig[];
  separateStems?: boolean;
  dialogueLines?: DialogueLine[];
  segmentMode?: boolean;
  projectId?: string;
}

export interface GenerateResponsePayload {
  clipId?: string;
  audioUrl?: string;
  downloadUrl?: string;
  audioBase64: string;
  mimeType: string;
  format?: AudioFormat;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  sizeBytes?: number;
  modelUsed: string;
  voiceId?: string;
  voiceName?: string;
  durationEstimateSec: number;
  durationMs?: number;
  wordTimings?: WordTiming[];
  phraseTimings?: PhraseTiming[];
  speechEnvelope?: SpeechEnvelopeInterval[];
  segments?: SpeechSegmentMeta[];
  stems?: Array<{ speaker: string; clipId: string; audioUrl: string; durationMs: number }>;
  appliedPronunciations?: string[];
}

export interface SavedVoicePresetConfig {
  id: string;
  name: string;
  voiceId: string;
  language: LanguageMode;
  stylePrompt: string;
  customVoiceDescription?: string;
  speed: number;
  pitchRegister: PitchRegister;
  emotionIntensity: EmotionIntensity;
  expressiveControls?: ExpressiveControls;
  masteringPreset?: MasteringPreset;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  createdAt: string;
}

export interface StudioProjectClip {
  clipId: string;
  title: string;
  text: string;
  voiceId: string;
  voiceName: string;
  language: LanguageMode;
  durationMs: number;
  sampleRate: SampleRateHz;
  channels: ChannelCount;
  audioUrl: string;
  downloadUrl: string;
  order: number;
  addedAt: string;
}

export interface StudioProject {
  id: string;
  name: string;
  description?: string;
  defaultVoicePresetId?: string;
  clips: StudioProjectClip[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryItem {
  id: string;
  clipId?: string;
  audioUrl?: string;
  downloadUrl?: string;
  createdAt: string;
  mode: StudioMode;
  language: LanguageMode;
  voiceLabel: string;
  voiceId: string;
  textPreview: string;
  fullText: string;
  stylePrompt: string;
  customVoiceDescription?: string;
  speed: number;
  pitchRegister?: PitchRegister;
  emotionIntensity?: EmotionIntensity;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  masteringPreset?: MasteringPreset;
  modelUsed: string;
  durationSec: number;
  durationMs?: number;
  audioBase64: string;
  wordTimings?: WordTiming[];
  segments?: SpeechSegmentMeta[];
  dialogueLines?: DialogueLine[];
  speakers?: {
    A: SpeakerConfig;
    B: SpeakerConfig;
  };
}
