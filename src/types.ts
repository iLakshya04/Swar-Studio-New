export type LanguageMode = 'en' | 'hi' | 'bilingual';
export type StudioMode = 'single' | 'multi';
export type EngineTier = 'standard' | 'expressive';
export type PrebuiltVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
export type PitchRegister = 'deep' | 'balanced' | 'bright';
export type EmotionIntensity = 'subtle' | 'natural' | 'dramatic';

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
  gender: 'Male' | 'Female';
  accent: string;
  description: string;
  defaultStyle: string;
  sampleText: string;
  sampleLanguage: LanguageMode;
  portraitUrl?: string;
}

export interface DialogueLine {
  id: string;
  speakerKey: 'A' | 'B';
  text: string;
}

export interface SpeakerConfig {
  name: string;
  voiceId: string;
  baseVoice: PrebuiltVoiceName;
  style: string;
}

export interface GenerateRequestPayload {
  mode: StudioMode;
  language: LanguageMode;
  modelTier: EngineTier;
  text: string;
  voiceName: PrebuiltVoiceName;
  stylePrompt: string;
  customVoiceDescription?: string;
  speed: number;
  pitchRegister?: PitchRegister;
  emotionIntensity?: EmotionIntensity;
  speakers?: {
    A: SpeakerConfig;
    B: SpeakerConfig;
  };
  dialogueLines?: DialogueLine[];
}

export interface GenerateResponsePayload {
  clipId?: string;
  audioUrl?: string;
  audioBase64: string;
  mimeType: string;
  modelUsed: string;
  durationEstimateSec: number;
}

export interface HistoryItem {
  id: string;
  clipId?: string;
  audioUrl?: string;
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
  modelUsed: string;
  durationSec: number;
  audioBase64: string;
  dialogueLines?: DialogueLine[];
  speakers?: {
    A: SpeakerConfig;
    B: SpeakerConfig;
  };
}
