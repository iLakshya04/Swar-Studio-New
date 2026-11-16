import type {
  DialogueLine,
  EmotionIntensity,
  EngineTier,
  ExpressiveControls,
  GenerateRequestPayload,
  LanguageMode,
  PitchRegister,
  VoicePreset,
} from '../types';

const DEVANAGARI_REGEX = /[\u0900-\u097F]/g;
const LATIN_WORD_REGEX = /[A-Za-z]{2,}/g;
const VOCAL_TAG_REGEX = /(<[a-z]+>|\|[a-z]+\|)/i;

export function detectScriptLanguage(text: string): LanguageMode {
  const cleaned = text
    .replace(/\[[A-Z_]{2,24}\]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\|[^|]+\|/g, '')
    .trim();
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
  const plainText = text
    .replace(/\[[A-Z_]{2,24}\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|[^|]+\|/g, ' ')
    .trim();
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

export function describeExpressiveControls(controls?: ExpressiveControls): string[] {
  if (!controls) return [];
  const cues: string[] = [];
  if (typeof controls.energy === 'number') {
    if (controls.energy >= 75) cues.push('high vocal energy and forward drive');
    else if (controls.energy <= 25) cues.push('calm, low-key restrained energy');
  }
  if (typeof controls.warmth === 'number') {
    if (controls.warmth >= 75) cues.push('rich, inviting vocal warmth');
    else if (controls.warmth <= 25) cues.push('cool, analytical objectivity');
  }
  if (typeof controls.authority === 'number' && controls.authority >= 70) {
    cues.push('commanding, grounded authority');
  }
  if (typeof controls.curiosity === 'number' && controls.curiosity >= 70) {
    cues.push('inquisitive, curious storytelling inflection');
  }
  if (typeof controls.dramaticTension === 'number' && controls.dramaticTension >= 70) {
    cues.push('cinematic dramatic tension');
  }
  if (typeof controls.pauseStrength === 'number') {
    if (controls.pauseStrength >= 75) cues.push('pronounced, thoughtful pauses at punctuation');
    else if (controls.pauseStrength <= 25) cues.push('tight, minimal pauses between clauses');
  }
  if (typeof controls.smile === 'number' && controls.smile >= 70) {
    cues.push('audible warm smile in the voice');
  }
  if (typeof controls.whisper === 'number' && controls.whisper >= 65) {
    cues.push('hushed, breathy near-whisper intimacy');
  }
  return cues;
}

export function buildStyleInstruction(params: {
  language: LanguageMode;
  stylePrompt: string;
  customVoiceDescription?: string;
  speed: number;
  pitchRegister?: PitchRegister;
  emotionIntensity?: EmotionIntensity;
  expressiveControls?: ExpressiveControls;
  pronunciationPrompt?: string;
  emotionHint?: string;
}): string {
  const parts: string[] = [];

  if (params.customVoiceDescription && params.customVoiceDescription.trim()) {
    parts.push(`Voice persona: ${params.customVoiceDescription.trim()}`);
  }

  if (params.stylePrompt.trim()) {
    parts.push(`Delivery style: ${params.stylePrompt.trim()}`);
  }

  if (params.emotionHint?.trim()) {
    parts.push(`Scene emotion: ${params.emotionHint.trim()}`);
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

  const expressiveCues = describeExpressiveControls(params.expressiveControls);
  if (expressiveCues.length > 0) {
    parts.push(...expressiveCues);
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

  if (params.pronunciationPrompt?.trim()) {
    parts.push(params.pronunciationPrompt.trim());
  }

  return parts.join('. ');
}

export interface ScriptChunkPlan {
  text: string;
  breakAfterMs: number;
  emotion?: string;
}

export function splitLongScriptIntoChunkPlans(
  text: string,
  maxChunkChars = 3500
): ScriptChunkPlan[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const plans: ScriptChunkPlan[] = [];
  let activeEmotion: string | undefined;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx += 1) {
    let para = paragraphs[pIdx];
    const emotionMatch = para.match(/^\[([A-Z_]{2,24})\]\s*/);
    if (emotionMatch) {
      activeEmotion = emotionMatch[1];
    } else if (activeEmotion && pIdx > 0 && !/^\[([A-Z_]{2,24})\]/.test(para)) {
      // Carry forward paragraph-level emotion cue unless cleared
    }

    const isLastPara = pIdx === paragraphs.length - 1;
    const paraBreakMs = isLastPara ? 0 : 220;

    if (para.length <= maxChunkChars) {
      // Merge short consecutive paragraphs ONLY when they share the same boundary and fit comfortably
      const prev = plans[plans.length - 1];
      if (
        prev &&
        !emotionMatch &&
        prev.text.length + 1 + para.length <= maxChunkChars &&
        plans.length === pIdx // keep single-chunk fast path for short scripts <= maxChunkChars
      ) {
        prev.text = `${prev.text}\n${para}`;
        prev.breakAfterMs = paraBreakMs;
      } else {
        plans.push({ text: para, breakAfterMs: paraBreakMs, emotion: activeEmotion });
      }
      continue;
    }

    // Long paragraph: split at sentence boundaries while carrying active emotion tag cleanly
    const sentences = para
      .split(/(?<=[.!?।])\s+/u)
      .map((s) => s.trim())
      .filter(Boolean);

    let current = '';
    for (let sIdx = 0; sIdx < sentences.length; sIdx += 1) {
      const sentence = sentences[sIdx];
      const sentEmotion = sentence.match(/^\[([A-Z_]{2,24})\]\s*/);
      if (sentEmotion) activeEmotion = sentEmotion[1];

      if (sentence.length > maxChunkChars) {
        if (current) {
          plans.push({ text: current, breakAfterMs: 130, emotion: activeEmotion });
          current = '';
        }
        for (let i = 0; i < sentence.length; i += maxChunkChars) {
          const slice = sentence.slice(i, i + maxChunkChars).trim();
          if (slice) {
            plans.push({
              text: slice,
              breakAfterMs: i + maxChunkChars >= sentence.length && sIdx === sentences.length - 1 ? paraBreakMs : 120,
              emotion: activeEmotion,
            });
          }
        }
        continue;
      }

      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length <= maxChunkChars) {
        current = candidate;
      } else {
        if (current) {
          plans.push({ text: current, breakAfterMs: 130, emotion: activeEmotion });
        }
        current =
          activeEmotion && !/^\[([A-Z_]{2,24})\]/.test(sentence)
            ? `[${activeEmotion}] ${sentence}`
            : sentence;
      }
    }
    if (current) {
      plans.push({ text: current, breakAfterMs: paraBreakMs, emotion: activeEmotion });
    }
  }

  return plans;
}

export function splitLongScriptIntoChunks(
  text: string,
  maxChunkChars = 3500
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkChars) return [trimmed];
  return splitLongScriptIntoChunkPlans(trimmed, maxChunkChars).map((p) => p.text);
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
    if (
      (!payload.speakerList || payload.speakerList.length === 0) &&
      (!payload.speakers?.A?.name?.trim() || !payload.speakers?.B?.name?.trim())
    ) {
      return {
        valid: false,
        error: 'All active speakers must have display names.',
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
