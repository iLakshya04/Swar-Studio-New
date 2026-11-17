import { VOICE_PRESETS } from '../data/voices';
import type {
  DialogueLine,
  GenerateRequestPayload,
  GenerateResponsePayload,
  LanguageMode,
  PitchRegister,
  PrebuiltVoiceName,
  WordTiming,
} from '../types';
import { clampSpeed, detectScriptLanguage } from './speechLogic';
import { buildFallbackWaveformPeaks } from './generateClient';
import { generateWordLevelSrt } from './subtitleGenerator';

export function isWebSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function stripTagsForWebSpeech(text: string): string {
  return text
    .replace(/\[[A-Z_]{2,24}\]\s*/g, '')
    .replace(/<(?:breath|sigh|pause)>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|(yeah|mhm|okay|right)\|/gi, '$1, ')
    .replace(/\|[^|]+\|/g, ' ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getAvailableWebSpeechVoices(
  timeoutMs = 700
): Promise<SpeechSynthesisVoice[]> {
  if (!isWebSpeechSupported()) return [];
  const synth = window.speechSynthesis;
  const initial = synth.getVoices();
  if (initial.length > 0) return initial;

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.('voiceschanged', onVoicesChanged);
      resolve(synth.getVoices());
    };
    const onVoicesChanged = () => finish();
    synth.addEventListener?.('voiceschanged', onVoicesChanged);
    setTimeout(finish, timeoutMs);
  });
}

export function computeWebSpeechPitch(
  pitchRegister: PitchRegister = 'balanced',
  clonePitchHz?: number
): number {
  let pitch =
    pitchRegister === 'deep' ? 0.84 : pitchRegister === 'bright' ? 1.15 : 1.0;

  if (typeof clonePitchHz === 'number' && clonePitchHz > 60) {
    // Map natural vocal F0 (95-240Hz) subtly around baseline ~155Hz
    const ratio = clonePitchHz / 155;
    pitch = 0.78 + (Math.max(0.65, Math.min(1.45, ratio)) - 0.65) * 0.55;
  }

  return Number(Math.max(0.65, Math.min(1.45, pitch)).toFixed(2));
}

const FEMALE_NAME_HINTS =
  /female|woman|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|veena|lekha|swara|kalpana|heera|neerja|aria|jenny|sara/i;
const MALE_NAME_HINTS =
  /male|man|david|mark|george|daniel|alex|fred|rishi|madhur|prabhat|hemant|ravi|guy|ryan|christopher/i;

export function pickBestWebSpeechVoice(
  voices: SpeechSynthesisVoice[],
  params: {
    voiceId?: string;
    voiceName?: PrebuiltVoiceName;
    language?: LanguageMode;
  }
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const preset =
    VOICE_PRESETS.find((v) => v.id === params.voiceId) ??
    VOICE_PRESETS.find((v) => v.baseVoice === params.voiceName);

  const wantGender = preset?.gender;
  const langMode = params.language || 'en';
  const accentHint = preset?.accent.toLowerCase() || '';

  const preferredLangPrefixes =
    langMode === 'hi'
      ? ['hi-IN', 'hi', 'en-IN', 'en']
      : langMode === 'bilingual'
        ? ['en-IN', 'hi-IN', 'en-GB', 'en-US', 'en']
        : accentHint.includes('rp') || accentHint.includes('british')
          ? ['en-GB', 'en-AU', 'en-US', 'en']
          : accentHint.includes('indian')
            ? ['en-IN', 'en-GB', 'en-US', 'en']
            : ['en-US', 'en-GB', 'en-IN', 'en'];

  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const voice of voices) {
    const lang = (voice.lang || '').toLowerCase();
    const name = (voice.name || '').toLowerCase();
    let score = 0;

    for (let i = 0; i < preferredLangPrefixes.length; i += 1) {
      const prefix = preferredLangPrefixes[i].toLowerCase();
      if (lang === prefix || lang.startsWith(`${prefix}-`) || lang.startsWith(prefix)) {
        score += (preferredLangPrefixes.length - i) * 30;
        break;
      }
    }

    if (wantGender === 'Female') {
      if (FEMALE_NAME_HINTS.test(name)) score += 18;
      if (MALE_NAME_HINTS.test(name)) score -= 12;
    } else if (wantGender === 'Male') {
      if (MALE_NAME_HINTS.test(name)) score += 18;
      if (FEMALE_NAME_HINTS.test(name)) score -= 12;
    }

    if (voice.localService) score += 6;
    if (name.includes('google') || name.includes('natural')) score += 5;
    if (voice.default) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  }

  return bestVoice ?? voices[0];
}

export function buildWebSpeechScript(
  payload: Pick<GenerateRequestPayload, 'mode' | 'text' | 'dialogueLines' | 'speakers'>
): string {
  if (payload.mode === 'multi' && Array.isArray(payload.dialogueLines)) {
    const lines = payload.dialogueLines.filter((l) => l.text.trim().length > 0);
    return lines
      .map((line) => {
        const clean = stripTagsForWebSpeech(line.text);
        if (!clean) return '';
        const speakerName =
          line.speakerKey === 'A'
            ? payload.speakers?.A?.name
            : line.speakerKey === 'B'
              ? payload.speakers?.B?.name
              : undefined;
        return speakerName ? `${speakerName}: ${clean}` : clean;
      })
      .filter(Boolean)
      .join('. ');
  }
  return stripTagsForWebSpeech(payload.text || '');
}

export function buildEstimatedWordTimingsForWebSpeech(
  script: string,
  speed = 1.0
): { wordTimings: WordTiming[]; durationMs: number } {
  const tokens = script.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { wordTimings: [], durationMs: 1000 };
  }

  const effectiveSpeed = clampSpeed(speed);
  // Base speaking rate ~148 WPM adjusted by speed
  const baseMsPerWord = Math.round((60000 / 148) / effectiveSpeed);
  let cursorMs = 80;
  const wordTimings: WordTiming[] = [];

  for (const rawWord of tokens) {
    const cleanLen = Math.max(2, rawWord.replace(/[^\p{L}\p{N}]/gu, '').length);
    const lengthFactor = Math.max(0.7, Math.min(1.55, cleanLen / 5.2));
    const punctPause = /[.!?।]$/.test(rawWord) ? 210 : /[,;:]$/.test(rawWord) ? 110 : 0;
    const wordDurMs = Math.max(150, Math.round(baseMsPerWord * lengthFactor));
    const startMs = cursorMs;
    const endMs = startMs + wordDurMs;

    wordTimings.push({
      word: rawWord,
      startMs,
      endMs,
      startSeconds: Number((startMs / 1000).toFixed(3)),
      endSeconds: Number((endMs / 1000).toFixed(3)),
    });

    cursorMs = endMs + 35 + Math.round(punctPause / effectiveSpeed);
  }

  return {
    wordTimings,
    durationMs: Math.max(800, cursorMs + 120),
  };
}

export async function synthesizeWithWebSpeech(
  payload: GenerateRequestPayload,
  options?: { fallbackReason?: string; clonePitchHz?: number }
): Promise<GenerateResponsePayload> {
  const spokenScript = buildWebSpeechScript(payload);
  if (!spokenScript) {
    throw new Error('Enter speakable script text before synthesizing.');
  }

  const effectiveLang =
    payload.language || detectScriptLanguage(spokenScript);
  const { wordTimings, durationMs } = buildEstimatedWordTimingsForWebSpeech(
    spokenScript,
    payload.speed
  );
  const durationEstimateSec = Number((durationMs / 1000).toFixed(2));
  const waveformPeaks = buildFallbackWaveformPeaks(
    wordTimings,
    durationEstimateSec,
    120
  );
  const wordSrt = generateWordLevelSrt(wordTimings);

  const voices = await getAvailableWebSpeechVoices();
  const matchedVoice = pickBestWebSpeechVoice(voices, {
    voiceId: payload.voiceId,
    voiceName: payload.voiceName,
    language: effectiveLang,
  });

  const clipId = `webspeech-${Date.now().toString(36)}`;
  const voiceUsed = matchedVoice
    ? `${matchedVoice.name} (${matchedVoice.lang})`
    : 'Browser OS Speech Engine';

  return {
    clipId,
    audioBase64: '',
    mimeType: 'audio/x-webspeech',
    format: 'wav',
    sampleRate: payload.sampleRate || 48000,
    channels: payload.channels || 1,
    modelUsed: 'webspeech:os-voice',
    voiceId: payload.voiceId || 'webspeech',
    voiceName: payload.voiceName || 'Zephyr',
    voiceUsed,
    durationEstimateSec,
    durationMs,
    timingSource: 'estimated',
    timingConfidence: 0.72,
    wordTimings,
    wordSrt,
    waveformPeaks,
    isLocalWebSpeech: true,
    localSpeechScript: spokenScript,
    fallbackReason: options?.fallbackReason,
  };
}
