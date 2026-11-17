import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { VOICE_PRESETS } from '../data/voices';
import type { LanguageMode, PitchRegister, PrebuiltVoiceName } from '../types';
import { clampSpeed } from '../utils/speechLogic';
import { stitchWavBuffers } from './wavAudio';

const execFileAsync = promisify(execFile);

const DEVANAGARI_CHAR = /[\u0900-\u097F]/;
const DEVANAGARI_GLOBAL = /[\u0900-\u097F]/g;

export interface KeylessChunk {
  text: string;
  langHint: 'hi' | 'en';
}

export interface KeylessVoiceProfile {
  tiktokVoice: string;
  googleEnglishLang: 'en-US' | 'en-GB' | 'en-IN';
  pitchFactor: number;
  speedMultiplier: number;
}

/**
 * Strip Svara inline performance tags (<breath>, [CURIOUS], |yeah|) cleanly
 * so keyless synthesis engines don't pronounce tag names literally.
 */
export function stripTagsForKeylessTts(text: string): string {
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

/**
 * Split long or bilingual (Hindi + English) scripts into chunks <= maxChars
 * at Devanagari/Latin script switches and punctuation/word boundaries.
 */
export function splitTextForKeylessChunks(
  rawText: string,
  language: LanguageMode = 'en',
  maxChars = 175
): KeylessChunk[] {
  const cleaned = stripTagsForKeylessTts(rawText);
  if (!cleaned) return [];

  // First segment into contiguous Hindi (Devanagari) vs English clauses if mixed
  const clauses: KeylessChunk[] = [];
  if (language === 'hi' && !/[A-Za-z]{2,}/.test(cleaned)) {
    clauses.push({ text: cleaned, langHint: 'hi' });
  } else if (language === 'en' && !DEVANAGARI_CHAR.test(cleaned)) {
    clauses.push({ text: cleaned, langHint: 'en' });
  } else {
    // Split on spaces while grouping consecutive words of the same script family
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    let currentLang: 'hi' | 'en' = DEVANAGARI_CHAR.test(tokens[0] || '') ? 'hi' : 'en';
    let currentTokens: string[] = [];

    for (const token of tokens) {
      const hasDev = DEVANAGARI_CHAR.test(token);
      const hasLat = /[A-Za-z]/.test(token);
      const tokenLang: 'hi' | 'en' = hasDev ? 'hi' : hasLat ? 'en' : currentLang;

      if (tokenLang !== currentLang && currentTokens.length > 0) {
        clauses.push({ text: currentTokens.join(' '), langHint: currentLang });
        currentTokens = [token];
        currentLang = tokenLang;
      } else {
        currentTokens.push(token);
      }
    }
    if (currentTokens.length > 0) {
      clauses.push({ text: currentTokens.join(' '), langHint: currentLang });
    }
  }

  // Now enforce maxChars per chunk at sentence -> comma -> word boundaries
  const finalChunks: KeylessChunk[] = [];
  for (const clause of clauses) {
    if (clause.text.length <= maxChars) {
      finalChunks.push(clause);
      continue;
    }

    const sentences = clause.text
      .split(/(?<=[.!?।,;:])\s+/u)
      .map((s) => s.trim())
      .filter(Boolean);

    let buf = '';
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (buf) {
          finalChunks.push({ text: buf, langHint: clause.langHint });
          buf = '';
        }
        const words = sentence.split(/\s+/);
        let wordBuf = '';
        for (const w of words) {
          if (w.length > maxChars) {
            if (wordBuf) {
              finalChunks.push({ text: wordBuf, langHint: clause.langHint });
              wordBuf = '';
            }
            for (let i = 0; i < w.length; i += maxChars) {
              finalChunks.push({ text: w.slice(i, i + maxChars), langHint: clause.langHint });
            }
            continue;
          }
          const cand = wordBuf ? `${wordBuf} ${w}` : w;
          if (cand.length <= maxChars) {
            wordBuf = cand;
          } else {
            if (wordBuf) finalChunks.push({ text: wordBuf, langHint: clause.langHint });
            wordBuf = w;
          }
        }
        if (wordBuf) {
          finalChunks.push({ text: wordBuf, langHint: clause.langHint });
        }
        continue;
      }

      const candidate = buf ? `${buf} ${sentence}` : sentence;
      if (candidate.length <= maxChars) {
        buf = candidate;
      } else {
        if (buf) finalChunks.push({ text: buf, langHint: clause.langHint });
        buf = sentence;
      }
    }
    if (buf) {
      finalChunks.push({ text: buf, langHint: clause.langHint });
    }
  }

  return finalChunks;
}

const PERSONA_KEYLESS_MAP: Record<string, Partial<KeylessVoiceProfile>> = {
  ethan: { tiktokVoice: 'en_male_narration', googleEnglishLang: 'en-US', pitchFactor: 0.93 },
  marcus: { tiktokVoice: 'en_male_narration', googleEnglishLang: 'en-US', pitchFactor: 0.87 },
  julian: { tiktokVoice: 'en_us_006', googleEnglishLang: 'en-US', pitchFactor: 0.91 },
  devon: { tiktokVoice: 'en_us_007', googleEnglishLang: 'en-US', pitchFactor: 0.97, speedMultiplier: 1.06 },
  noah: { tiktokVoice: 'en_us_006', googleEnglishLang: 'en-US', pitchFactor: 1.03, speedMultiplier: 1.05 },
  arthur: { tiktokVoice: 'en_uk_003', googleEnglishLang: 'en-GB', pitchFactor: 0.94 },
  clara: { tiktokVoice: 'en_uk_001', googleEnglishLang: 'en-GB', pitchFactor: 0.99 },
  elena: { tiktokVoice: 'en_female_emotional', googleEnglishLang: 'en-US', pitchFactor: 0.98 },
  maya: { tiktokVoice: 'en_us_001', googleEnglishLang: 'en-US', pitchFactor: 1.02 },
  riya: { tiktokVoice: 'en_us_001', googleEnglishLang: 'en-IN', pitchFactor: 1.04 },
  ananya: { tiktokVoice: 'en_female_emotional', googleEnglishLang: 'en-IN', pitchFactor: 1.0 },
  meera: { tiktokVoice: 'en_uk_001', googleEnglishLang: 'en-IN', pitchFactor: 0.98 },
  aarav: { tiktokVoice: 'en_male_narration', googleEnglishLang: 'en-IN', pitchFactor: 0.92 },
  vikram: { tiktokVoice: 'en_us_006', googleEnglishLang: 'en-IN', pitchFactor: 0.94 },
  kabir: { tiktokVoice: 'en_male_narration', googleEnglishLang: 'en-IN', pitchFactor: 0.91 },
  rohan: { tiktokVoice: 'en_male_narration', googleEnglishLang: 'en-IN', pitchFactor: 0.89 },
};

export function resolveKeylessVoiceProfile(params: {
  voiceId?: string;
  voiceName?: PrebuiltVoiceName;
  language?: LanguageMode;
  pitchRegister?: PitchRegister;
}): KeylessVoiceProfile {
  const preset =
    VOICE_PRESETS.find((v) => v.id === params.voiceId) ??
    VOICE_PRESETS.find((v) => v.baseVoice === params.voiceName);

  const mapped = preset ? PERSONA_KEYLESS_MAP[preset.id] : undefined;

  let tiktokVoice = mapped?.tiktokVoice;
  if (!tiktokVoice) {
    if (params.voiceName === 'Charon' || params.voiceName === 'Fenrir') {
      tiktokVoice = 'en_male_narration';
    } else if (params.voiceName === 'Puck') {
      tiktokVoice = 'en_us_006';
    } else if (params.voiceName === 'Zephyr') {
      tiktokVoice = 'en_us_001';
    } else {
      tiktokVoice = 'en_female_emotional';
    }
  }

  let googleEnglishLang: 'en-US' | 'en-GB' | 'en-IN' = mapped?.googleEnglishLang || 'en-US';
  if (!mapped?.googleEnglishLang && params.language === 'bilingual') {
    googleEnglishLang = 'en-IN';
  }

  let pitchFactor = mapped?.pitchFactor ?? 1.0;
  if (params.pitchRegister === 'deep') {
    pitchFactor *= 0.92;
  } else if (params.pitchRegister === 'bright') {
    pitchFactor *= 1.08;
  }
  pitchFactor = Math.max(0.78, Math.min(1.22, Number(pitchFactor.toFixed(3))));

  return {
    tiktokVoice,
    googleEnglishLang,
    pitchFactor,
    speedMultiplier: mapped?.speedMultiplier ?? 1.0,
  };
}

async function decodeMp3ToMonoWav(
  mp3Buffer: Buffer,
  options: { pitchFactor?: number; speed?: number } = {}
): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svara-keyless-'));
  const inPath = path.join(tmpDir, 'chunk.mp3');
  const outPath = path.join(tmpDir, 'chunk.wav');

  try {
    await fs.writeFile(inPath, mp3Buffer);
    const pitch = Math.max(0.78, Math.min(1.22, options.pitchFactor ?? 1.0));
    const speed = clampSpeed(options.speed ?? 1.0);
    // Compensate asetrate tempo change so pitch shift preserves desired speed
    const atempoVal = Math.max(0.55, Math.min(1.85, speed / pitch));

    const filters: string[] = [];
    if (Math.abs(pitch - 1.0) >= 0.015) {
      filters.push(`asetrate=24000*${pitch.toFixed(4)}`, 'aresample=24000');
    }
    if (Math.abs(atempoVal - 1.0) >= 0.015) {
      filters.push(`atempo=${atempoVal.toFixed(4)}`);
    }

    const args = ['-y', '-i', inPath];
    if (filters.length > 0) {
      args.push('-af', filters.join(','));
    }
    args.push('-ar', '24000', '-ac', '1', '-f', 'wav', outPath);

    await execFileAsync('ffmpeg', args, { timeout: 20000 });
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function synthesizeKeylessNeuralTts(params: {
  text: string;
  voiceId?: string;
  voiceName?: PrebuiltVoiceName;
  language?: LanguageMode;
  pitchRegister?: PitchRegister;
  speed?: number;
}): Promise<Buffer> {
  const lang = params.language || 'en';
  if (lang === 'hi' || DEVANAGARI_GLOBAL.test(params.text)) {
    const err = new Error('Keyless neural English TTS does not speak Devanagari directly.') as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
  }

  const profile = resolveKeylessVoiceProfile(params);
  const chunks = splitTextForKeylessChunks(params.text, 'en', 220);
  if (chunks.length === 0) {
    throw new Error('No speakable text after stripping tags.');
  }

  const chunkWavs: Buffer[] = [];
  const effectiveSpeed = clampSpeed((params.speed ?? 1.0) * profile.speedMultiplier);

  // TikTok voices already have distinct male/female pitch; apply only register delta around 1.0
  let subtlePitch = 1.0;
  if (params.pitchRegister === 'deep') subtlePitch = 0.93;
  else if (params.pitchRegister === 'bright') subtlePitch = 1.07;

  for (const chunk of chunks) {
    const res = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunk.text,
        voice: profile.tiktokVoice,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const err = new Error(`Keyless neural TTS failed (${res.status}).`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as { success?: boolean; data?: string; error?: string };
    if (!data.success || !data.data) {
      const err = new Error(data.error || 'Keyless neural TTS returned no audio.') as Error & {
        status?: number;
      };
      err.status = 502;
      throw err;
    }

    const mp3Buffer = Buffer.from(data.data, 'base64');
    const wav = await decodeMp3ToMonoWav(mp3Buffer, {
      pitchFactor: subtlePitch,
      speed: effectiveSpeed,
    });
    chunkWavs.push(wav);
  }

  if (chunkWavs.length === 1) {
    return chunkWavs[0];
  }
  return stitchWavBuffers(chunkWavs, 90, 24000, 1).wavBuffer;
}

export async function synthesizeKeylessGoogleTts(params: {
  text: string;
  voiceId?: string;
  voiceName?: PrebuiltVoiceName;
  language?: LanguageMode;
  pitchRegister?: PitchRegister;
  speed?: number;
}): Promise<Buffer> {
  const langMode = params.language || (DEVANAGARI_CHAR.test(params.text) ? 'hi' : 'en');
  const profile = resolveKeylessVoiceProfile(params);
  const chunks = splitTextForKeylessChunks(params.text, langMode, 175);
  if (chunks.length === 0) {
    throw new Error('No speakable text after stripping tags.');
  }

  const chunkWavs: Buffer[] = [];
  const effectiveSpeed = clampSpeed((params.speed ?? 1.0) * profile.speedMultiplier);

  for (const chunk of chunks) {
    const tl = chunk.langHint === 'hi' ? 'hi' : profile.googleEnglishLang;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
      tl
    )}&q=${encodeURIComponent(chunk.text)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const err = new Error(`Keyless Google TTS failed (${res.status}).`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }

    const mp3Buffer = Buffer.from(await res.arrayBuffer());
    if (mp3Buffer.length < 256) {
      const err = new Error('Keyless Google TTS returned empty audio.') as Error & {
        status?: number;
      };
      err.status = 502;
      throw err;
    }

    const wav = await decodeMp3ToMonoWav(mp3Buffer, {
      pitchFactor: profile.pitchFactor,
      speed: effectiveSpeed,
    });
    chunkWavs.push(wav);
  }

  if (chunkWavs.length === 1) {
    return chunkWavs[0];
  }
  return stitchWavBuffers(chunkWavs, 85, 24000, 1).wavBuffer;
}

/**
 * Keyless script translation fallback using MyMemory when Gemini text quota is exhausted.
 * Preserves inline Svara performance tags (<breath>, [CURIOUS], |yeah|).
 */
export async function translateScriptKeyless(
  text: string,
  targetLanguage: LanguageMode
): Promise<string> {
  const sourceLang: 'en' | 'hi' = DEVANAGARI_CHAR.test(text) ? 'hi' : 'en';
  const targetLang: 'en' | 'hi' = targetLanguage === 'en' ? 'en' : 'hi';

  if (sourceLang === targetLang && targetLanguage !== 'bilingual') {
    return text.trim();
  }

  // Extract inline tags so they survive translation intact
  const tagMatches: string[] = [];
  const tokenized = text
    .trim()
    .replace(/(\[[A-Z_]{2,24}\]|<[^>]+>|\|[^|]+\|)/g, (match) => {
      const idx = tagMatches.length;
      tagMatches.push(match);
      return `[[SVARA_TAG_${idx}]]`;
    });

  // Chunk translation requests to stay comfortably under MyMemory's 500-char query limit
  const sentences = tokenized.split(/(?<=[.!?।])\s+/u).filter(Boolean);
  const translatedParts: string[] = [];

  for (const sentence of sentences) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      sentence.slice(0, 480)
    )}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      throw new Error(`Keyless translation failed (${res.status}).`);
    }
    const json = (await res.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    const part = json?.responseData?.translatedText?.trim();
    if (!part) {
      throw new Error('Keyless translation returned empty text.');
    }
    translatedParts.push(part);
  }

  let result = translatedParts.join(' ');
  for (let i = 0; i < tagMatches.length; i += 1) {
    result = result.replace(new RegExp(`\\[\\[\\s*SVARA_TAG_${i}\\s*\\]\\]`, 'gi'), tagMatches[i]);
  }
  return result.replace(/\s+/g, ' ').trim();
}
