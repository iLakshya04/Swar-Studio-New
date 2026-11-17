import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { VOICE_PRESETS } from '../data/voices';
import type {
  CloneAcousticProfile,
  LanguageMode,
  PitchRegister,
  SavedVoicePresetConfig,
} from '../types';
import { listVoicePresets, upsertVoicePreset } from './studioStore';
import { parseWavBuffer, toMonoPcm } from './wavAudio';

const execFileAsync = promisify(execFile);

function inferExtFromMime(mimeType = ''): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('webm')) return '.webm';
  if (lower.includes('ogg')) return '.ogg';
  if (lower.includes('mpeg') || lower.includes('mp3')) return '.mp3';
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return '.m4a';
  if (lower.includes('flac')) return '.flac';
  return '.wav';
}

export async function decodeAudioBufferToMono24kPcm(
  buffer: Buffer,
  mimeType = 'audio/wav'
): Promise<{ pcm: Int16Array; durationMs: number; sampleRate: number }> {
  const isRiffWav =
    buffer.length >= 44 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';

  if (isRiffWav) {
    const parsed = parseWavBuffer(buffer);
    const mono = toMonoPcm(parsed.pcm, parsed.channels);
    if (parsed.sampleRate === 24000) {
      return { pcm: mono, durationMs: parsed.durationMs, sampleRate: 24000 };
    }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svara-clone-'));
  const inPath = path.join(tmpDir, `sample${inferExtFromMime(mimeType)}`);
  const outPath = path.join(tmpDir, 'decoded.wav');
  try {
    await fs.writeFile(inPath, buffer);
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', inPath, '-ar', '24000', '-ac', '1', '-f', 'wav', outPath],
      { timeout: 25000 }
    );
    const wavBuf = await fs.readFile(outPath);
    const parsed = parseWavBuffer(wavBuf);
    return {
      pcm: parsed.pcm,
      durationMs: Math.max(500, parsed.durationMs),
      sampleRate: 24000,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function extractAcousticProfileFromPcm(
  pcm: Int16Array,
  sampleRate = 24000,
  durationMsHint?: number
): {
  pitchHz: number;
  pitchRegister: PitchRegister;
  speakingWpm: number;
  warmth: number;
  brightness: number;
  energy: number;
  durationMs: number;
} {
  const durationMs =
    typeof durationMsHint === 'number' && durationMsHint > 0
      ? Math.round(durationMsHint)
      : Math.max(500, Math.round((pcm.length / Math.max(1, sampleRate)) * 1000));

  if (pcm.length < Math.floor(sampleRate * 0.1)) {
    return {
      pitchHz: 152,
      pitchRegister: 'balanced',
      speakingWpm: 142,
      warmth: 68,
      brightness: 55,
      energy: 62,
      durationMs,
    };
  }

  // RMS + zero-crossing rate + voiced energy frames
  const frameLen = Math.max(256, Math.round(sampleRate * 0.03)); // 30ms frames
  const frameEnergies: number[] = [];
  let totalSq = 0;
  let zeroCrossings = 0;

  for (let i = 0; i < pcm.length; i += 1) {
    const norm = pcm[i] / 32768;
    totalSq += norm * norm;
    if (i > 0) {
      const prev = pcm[i - 1];
      if ((prev >= 0 && pcm[i] < 0) || (prev < 0 && pcm[i] >= 0)) {
        zeroCrossings += 1;
      }
    }
  }

  for (let start = 0; start + frameLen <= pcm.length; start += frameLen) {
    let fSq = 0;
    for (let j = 0; j < frameLen; j += 1) {
      const n = pcm[start + j] / 32768;
      fSq += n * n;
    }
    frameEnergies.push(Math.sqrt(fSq / frameLen));
  }

  const globalRms = Math.sqrt(totalSq / Math.max(1, pcm.length));
  const zcrRate = zeroCrossings / Math.max(1, pcm.length);

  // Autocorrelation pitch estimation over active voiced frames (75 Hz - 320 Hz)
  const acFrame = Math.min(1024, Math.floor(sampleRate * 0.04));
  const minLag = Math.max(16, Math.floor(sampleRate / 320));
  const maxLag = Math.min(acFrame - 2, Math.floor(sampleRate / 75));
  const pitchCandidates: number[] = [];
  const activeThreshold = Math.max(0.015, globalRms * 0.55);

  for (let start = 0; start + acFrame <= pcm.length; start += acFrame) {
    let sq = 0;
    for (let j = 0; j < acFrame; j += 1) {
      const n = pcm[start + j] / 32768;
      sq += n * n;
    }
    const rms = Math.sqrt(sq / acFrame);
    if (rms < activeThreshold) continue;

    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let num = 0;
      let denA = 0;
      let denB = 0;
      const limit = acFrame - lag;
      for (let i = 0; i < limit; i += 2) {
        const a = pcm[start + i] / 32768;
        const b = pcm[start + i + lag] / 32768;
        num += a * b;
        denA += a * a;
        denB += b * b;
      }
      const den = Math.sqrt(denA * denB);
      const corr = den > 0 ? num / den : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && bestCorr >= 0.4) {
      pitchCandidates.push(sampleRate / bestLag);
    }
  }

  let pitchHz = 152;
  if (pitchCandidates.length > 0) {
    pitchCandidates.sort((a, b) => a - b);
    pitchHz = Math.round(pitchCandidates[Math.floor(pitchCandidates.length / 2)]);
  }

  // Estimate cadence from active-speech syllable envelope transitions
  const peakEnv = Math.max(0.05, ...frameEnergies);
  const syllThresh = peakEnv * 0.28;
  let pulses = 0;
  let inPulse = false;
  let activeFrames = 0;
  for (const e of frameEnergies) {
    if (e >= activeThreshold * 0.7) activeFrames += 1;
    if (!inPulse && e >= syllThresh) {
      inPulse = true;
      pulses += 1;
    } else if (inPulse && e < syllThresh * 0.55) {
      inPulse = false;
    }
  }

  const activeSec = Math.max(0.8, (activeFrames * frameLen) / sampleRate);
  const pulsesPerMin = (pulses / activeSec) * 60;
  const speakingWpm = Math.max(
    112,
    Math.min(176, Math.round(pulses > 2 ? Math.max(115, Math.min(175, pulsesPerMin * 0.72)) : 142))
  );

  const energy = Math.max(28, Math.min(95, Math.round(globalRms * 460)));
  const brightness = Math.max(25, Math.min(92, Math.round(zcrRate * 540)));
  const warmth = Math.max(32, Math.min(94, Math.round(102 - brightness * 0.45)));

  const pitchRegister: PitchRegister =
    pitchHz < 142 ? 'deep' : pitchHz > 192 ? 'bright' : 'balanced';

  return {
    pitchHz,
    pitchRegister,
    speakingWpm,
    warmth,
    brightness,
    energy,
    durationMs,
  };
}

export function buildClonePresetFromMetrics(params: {
  presetName: string;
  language: LanguageMode;
  metrics: ReturnType<typeof extractAcousticProfileFromPcm>;
  aiStyleHint?: string;
  aiDescriptionHint?: string;
  source?: CloneAcousticProfile['source'];
}): SavedVoicePresetConfig {
  const { metrics, language } = params;
  const preferredGender = metrics.pitchHz >= 175 ? 'Female' : 'Male';
  const langLabel =
    language === 'hi' ? 'Hindi' : language === 'bilingual' ? 'Bilingual' : 'English';

  const matchedVoice =
    VOICE_PRESETS.find(
      (v) => v.gender === preferredGender && (v.language === langLabel || v.language === 'Bilingual')
    ) ??
    VOICE_PRESETS.find((v) => v.gender === preferredGender) ??
    VOICE_PRESETS[0];

  const cleanName = params.presetName.trim() || 'My Studio Voice';
  const finalName = /^clone\b/i.test(cleanName) ? cleanName : `Clone — ${cleanName}`;

  const registerLabel =
    metrics.pitchRegister === 'deep'
      ? 'Deep grounded'
      : metrics.pitchRegister === 'bright'
        ? 'Bright articulate'
        : 'Balanced warm';

  const timbreSummary = `${registerLabel} vocal timbre (~${metrics.pitchHz} Hz, ${metrics.speakingWpm} WPM)`;
  const customVoiceDescription =
    params.aiDescriptionHint?.trim() ||
    `Cloned voice model: ${timbreSummary}. Modeled from a ${(metrics.durationMs / 1000).toFixed(1)}s vocal capture with ${metrics.warmth >= 70 ? 'warm resonant body' : 'crisp studio presence'}.`;

  const stylePrompt =
    params.aiStyleHint?.trim() ||
    `Natural personal clone delivery matching ${timbreSummary}`;

  const speed = Number(Math.max(0.85, Math.min(1.22, metrics.speakingWpm / 142)).toFixed(2));
  const now = new Date().toISOString();

  return {
    id: `clone-${Date.now().toString(36)}`,
    name: finalName,
    voiceId: matchedVoice.id,
    language,
    stylePrompt,
    customVoiceDescription,
    speed,
    pitchRegister: metrics.pitchRegister,
    emotionIntensity: metrics.energy > 72 ? 'natural' : 'subtle',
    expressiveControls: {
      warmth: metrics.warmth,
      energy: metrics.energy,
      authority: metrics.pitchRegister === 'deep' ? 78 : 62,
      pauseStrength: 58,
    },
    masteringPreset: 'podcast',
    sampleRate: 48000,
    channels: 1,
    createdAt: now,
    isClone: true,
    clonedAt: now,
    sampleDurationMs: metrics.durationMs,
    cloneAcousticProfile: {
      pitchHz: metrics.pitchHz,
      pitchRegister: metrics.pitchRegister,
      speakingWpm: metrics.speakingWpm,
      warmth: metrics.warmth,
      brightness: metrics.brightness,
      energy: metrics.energy,
      timbreSummary,
      matchedBaseVoiceName: matchedVoice.baseVoice,
      source: params.source || 'dsp',
    },
  };
}

export async function createClonedVoicePreset(params: {
  buffer: Buffer;
  mimeType?: string;
  presetName: string;
  language?: LanguageMode;
  optionalAiAnalyze?: (
    buffer: Buffer,
    mimeType: string
  ) => Promise<{
    transcript?: string;
    voiceDescription?: string;
    recommendedStylePrompt?: string;
  }>;
}): Promise<{
  preset: SavedVoicePresetConfig;
  presets: SavedVoicePresetConfig[];
  transcript: string;
}> {
  const mimeType = params.mimeType || 'audio/wav';
  const { pcm, durationMs, sampleRate } = await decodeAudioBufferToMono24kPcm(
    params.buffer,
    mimeType
  );
  const metrics = extractAcousticProfileFromPcm(pcm, sampleRate, durationMs);

  let aiDescriptionHint: string | undefined;
  let aiStyleHint: string | undefined;
  let transcript = '';
  let source: CloneAcousticProfile['source'] = 'dsp';

  if (params.optionalAiAnalyze && process.env.GEMINI_API_KEY?.trim()) {
    try {
      const aiRes = await Promise.race([
        params.optionalAiAnalyze(params.buffer, mimeType),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (aiRes) {
        if (aiRes.voiceDescription) {
          aiDescriptionHint = aiRes.voiceDescription;
          source = 'gemini+dsp';
        }
        if (aiRes.recommendedStylePrompt) {
          aiStyleHint = aiRes.recommendedStylePrompt;
        }
        if (aiRes.transcript) {
          transcript = aiRes.transcript;
        }
      }
    } catch {
      // Quota exhaustion or offline Gemini key silently uses verified DSP clone metrics
    }
  }

  const candidate = buildClonePresetFromMetrics({
    presetName: params.presetName,
    language: params.language || 'en',
    metrics,
    aiDescriptionHint,
    aiStyleHint,
    source,
  });

  const preset = upsertVoicePreset(candidate);
  return {
    preset,
    presets: listVoicePresets(),
    transcript,
  };
}
