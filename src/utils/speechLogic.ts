import type {
  DialogueLine,
  EmotionIntensity,
  EngineTier,
  GenerateRequestPayload,
  LanguageMode,
  PitchRegister,
  VoicePreset,
} from '../types';

const DEVANAGARI_REGEX = /[\u0900-\u097F]/g;
const LATIN_WORD_REGEX = /[A-Za-z]{2,}/g;
const VOCAL_TAG_REGEX = /(<[a-z]+>|\|[a-z]+\|)/i;

export function detectScriptLanguage(text: string): LanguageMode {
  const cleaned = text.replace(/<[^>]+>/g, '').replace(/\|[^|]+\|/g, '').trim();
  if (!cleaned) {
    return 'en';
  }
  const devanagariMatches = cleaned.match(DEVANAGARI_REGEX) ?? [];
  const latinMatches = cleaned.match(LATIN_WORD_REGEX) ?? [];

  if (devanagariMatches.length > 0 && latinMatches.length > 1) {
    return 'bilingual';
  }
  if (devanagariMatches.length > 0) {
    return 'hi';
  }
  return 'en';
}

export function countWordsAndChars(text: string): {
  chars: number;
  words: number;
  estimatedSeconds: number;
} {
  const chars = text.length;
  const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\|[^|]+\|/g, ' ').trim();
  if (!plainText) {
    return { chars, words: 0, estimatedSeconds: 0 };
  }
  const words = plainText.split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.max(1, Math.round((words / 140) * 60));
  return { chars, words, estimatedSeconds };
}

export function insertVocalTagAtCursor(
  text: string,
  tag: string,
  selectionStart: number,
  selectionEnd: number
): { nextText: string; nextCursor: number } {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, text.length));

  const before = text.slice(0, safeStart);
  const after = text.slice(safeEnd);

  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);

  const inserted = `${needsLeadingSpace ? ' ' : ''}${tag}${needsTrailingSpace ? ' ' : ''}`;
  const nextText = `${before}${inserted}${after}`;
  const nextCursor = before.length + inserted.length;

  return { nextText, nextCursor };
}

export function filterVoices(
  voices: VoicePreset[],
  query: string,
  languageFilter: 'All' | 'English' | 'Hindi' | 'Bilingual',
  categoryFilter: 'All' | VoicePreset['category']
): VoicePreset[] {
  const normalizedQuery = query.trim().toLowerCase();

  return voices.filter((voice) => {
    const matchesLang =
      languageFilter === 'All' ||
      voice.language === languageFilter ||
      (languageFilter !== 'Bilingual' && voice.language === 'Bilingual');

    const matchesCategory = categoryFilter === 'All' || voice.category === categoryFilter;

    if (!matchesLang || !matchesCategory) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      voice.name,
      voice.roleTitle,
      voice.description,
      voice.accent,
      voice.category,
      voice.language,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function selectTtsModel(params: {
  mode: 'single' | 'multi';
  modelTier: EngineTier;
  text: string;
  customVoiceDescription?: string;
  dialogueLines?: DialogueLine[];
}): 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts' {
  if (params.mode === 'multi' || params.modelTier === 'expressive') {
    return 'gemini-3.8-flash-tts';
  }
  if (params.customVoiceDescription && params.customVoiceDescription.trim().length > 0) {
    return 'gemini-3.8-flash-tts';
  }
  if (VOCAL_TAG_REGEX.test(params.text)) {
    return 'gemini-3.8-flash-tts';
  }
  if (params.dialogueLines?.some((line) => VOCAL_TAG_REGEX.test(line.text))) {
    return 'gemini-3.8-flash-tts';
  }
  return 'gemini-3.8-flash-lite-tts';
}

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1.0;
  return Math.min(1.4, Math.max(0.7, Math.round(speed * 20) / 20));
}

export function buildStyleInstruction(params: {
  language: LanguageMode;
  stylePrompt: string;
  customVoiceDescription?: string;
  speed: number;
  pitchRegister?: PitchRegister;
  emotionIntensity?: EmotionIntensity;
}): string {
  const parts: string[] = [];

  if (params.customVoiceDescription && params.customVoiceDescription.trim()) {
    parts.push(`Voice persona: ${params.customVoiceDescription.trim()}`);
  }

  if (params.stylePrompt.trim()) {
    parts.push(`Delivery style: ${params.stylePrompt.trim()}`);
  }

  if (params.pitchRegister === 'deep') {
    parts.push('Rich, grounded lower vocal register');
  } else if (params.pitchRegister === 'bright') {
    parts.push('Crisp, lifted higher vocal register');
  }

  if (params.emotionIntensity === 'subtle') {
    parts.push('restrained, understated emotional tone');
  } else if (params.emotionIntensity === 'dramatic') {
    parts.push('highly expressive, theatrical emotional inflection');
  }

  if (params.language === 'hi') {
    parts.push('Speak with authentic, natural Hindi pronunciation and cadence');
  } else if (params.language === 'bilingual') {
    parts.push(
      'Speak naturally across Hindi and English with seamless bilingual pronunciation and code-switching'
    );
  } else {
    parts.push('Speak with natural, clear English articulation');
  }

  const normalizedSpeed = clampSpeed(params.speed);
  if (normalizedSpeed <= 0.8) {
    parts.push('unhurried, deliberate slow pacing');
  } else if (normalizedSpeed <= 0.9) {
    parts.push('relaxed, measured pacing');
  } else if (normalizedSpeed >= 1.25) {
    parts.push('brisk, energetic fast pacing');
  } else if (normalizedSpeed >= 1.1) {
    parts.push('slightly upbeat pacing');
  }

  return parts.join('. ');
}

export function validateGeneratePayload(
  payload: Partial<GenerateRequestPayload>
): { valid: boolean; error?: string } {
  if (payload.mode === 'multi') {
    const lines = payload.dialogueLines ?? [];
    const nonEmptyLines = lines.filter((line) => line.text.trim().length > 0);
    if (nonEmptyLines.length === 0) {
      return {
        valid: false,
        error: 'Enter at least one non-empty dialogue line before generating audio.',
      };
    }
    const totalLength = nonEmptyLines.reduce((acc, line) => acc + line.text.length, 0);
    if (totalLength > 4000) {
      return {
        valid: false,
        error: 'Dialogue script exceeds the 4,000-character limit.',
      };
    }
    if (!payload.speakers?.A?.name?.trim() || !payload.speakers?.B?.name?.trim()) {
      return {
        valid: false,
        error: 'Both Speaker A and Speaker B must have display names.',
      };
    }
    return { valid: true };
  }

  const text = (payload.text ?? '').trim();
  if (!text) {
    return {
      valid: false,
      error: 'Enter a script in English or Hindi before generating speech.',
    };
  }
  if (text.length > 4000) {
    return {
      valid: false,
      error: 'Script exceeds the 4,000-character limit.',
    };
  }

  return { valid: true };
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const rounded = Math.floor(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
