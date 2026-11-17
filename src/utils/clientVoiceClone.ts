import { VOICE_PRESETS } from '../data/voices';
import type {
  CloneAcousticProfile,
  LanguageMode,
  PitchRegister,
  SavedVoicePresetConfig,
} from '../types';

function estimateF0FromFloatSamples(
  samples: Float32Array,
  sampleRate: number
): number {
  const frameSize = Math.min(2048, Math.floor(sampleRate * 0.04));
  const minLag = Math.max(16, Math.floor(sampleRate / 320));
  const maxLag = Math.min(frameSize - 2, Math.floor(sampleRate / 75));
  if (maxLag <= minLag || samples.length < frameSize) return 152;

  const hop = frameSize;
  const pitches: number[] = [];

  for (let start = 0; start + frameSize <= samples.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const s = samples[start + i];
      energy += s * s;
    }
    const rms = Math.sqrt(energy / frameSize);
    if (rms < 0.015) continue; // unvoiced / silence

    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let num = 0;
      let denA = 0;
      let denB = 0;
      const limit = frameSize - lag;
      for (let i = 0; i < limit; i += 2) {
        const a = samples[start + i];
        const b = samples[start + i + lag];
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

    if (bestLag > 0 && bestCorr >= 0.42) {
      pitches.push(sampleRate / bestLag);
    }
  }

  if (pitches.length === 0) return 152;
  pitches.sort((a, b) => a - b);
  return Math.round(pitches[Math.floor(pitches.length / 2)]);
}

export async function analyzeCloneAudioInBrowser(params: {
  audioBlob: Blob;
  presetName: string;
  language: LanguageMode;
  durationMsHint?: number;
}): Promise<{ preset: SavedVoicePresetConfig; durationMs: number }> {
  const arrayBuf = await params.audioBlob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  let pitchHz = 154;
  let speakingWpm = 142;
  let warmth = 68;
  let brightness = 58;
  let energy = 64;
  let durationMs = params.durationMsHint || 5000;

  if (AudioCtx) {
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      const channel = decoded.getChannelData(0);
      durationMs = Math.max(500, Math.round(decoded.duration * 1000));
      pitchHz = estimateF0FromFloatSamples(channel, decoded.sampleRate);

      let sumSq = 0;
      let zcrCount = 0;
      for (let i = 1; i < channel.length; i += 1) {
        sumSq += channel[i] * channel[i];
        if ((channel[i - 1] >= 0 && channel[i] < 0) || (channel[i - 1] < 0 && channel[i] >= 0)) {
          zcrCount += 1;
        }
      }
      const rms = Math.sqrt(sumSq / Math.max(1, channel.length));
      const zcrRate = zcrCount / Math.max(1, channel.length);
      energy = Math.max(30, Math.min(92, Math.round(rms * 420)));
      brightness = Math.max(30, Math.min(90, Math.round(zcrRate * 550)));
      warmth = Math.max(35, Math.min(92, 100 - Math.round(brightness * 0.45)));
      speakingWpm = Math.max(118, Math.min(168, Math.round(125 + energy * 0.42)));
    } catch {
      // Fall back to balanced browser acoustic defaults if codec isn't natively decodable
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  const pitchRegister: PitchRegister =
    pitchHz < 142 ? 'deep' : pitchHz > 192 ? 'bright' : 'balanced';

  const preferredGender = pitchHz >= 175 ? 'Female' : 'Male';
  const langTarget =
    params.language === 'hi'
      ? 'Hindi'
      : params.language === 'bilingual'
        ? 'Bilingual'
        : 'English';

  const matchedVoice =
    VOICE_PRESETS.find(
      (v) => v.gender === preferredGender && (v.language === langTarget || v.language === 'Bilingual')
    ) ??
    VOICE_PRESETS.find((v) => v.gender === preferredGender) ??
    VOICE_PRESETS[0];

  const cleanName = params.presetName.trim() || 'My Studio Voice';
  const finalName = /^clone\b/i.test(cleanName) ? cleanName : `Clone — ${cleanName}`;
  const timbreSummary = `${pitchRegister === 'deep' ? 'Deep grounded' : pitchRegister === 'bright' ? 'Bright articulate' : 'Balanced warm'} vocal timbre (~${pitchHz} Hz, ${speakingWpm} WPM)`;
  const customDesc = `Cloned speaker profile: ${timbreSummary}. Expressive clarity modeled from ${(durationMs / 1000).toFixed(1)}s reference recording.`;

  const acousticProfile: CloneAcousticProfile = {
    pitchHz,
    pitchRegister,
    speakingWpm,
    warmth,
    brightness,
    energy,
    timbreSummary,
    matchedBaseVoiceName: matchedVoice.baseVoice,
    source: 'browser-audio',
  };

  const speed = Number(Math.max(0.85, Math.min(1.2, speakingWpm / 142)).toFixed(2));

  const preset: SavedVoicePresetConfig = {
    id: `clone-${Date.now().toString(36)}`,
    name: finalName,
    voiceId: matchedVoice.id,
    language: params.language,
    stylePrompt: `Natural cloned delivery matched to ${timbreSummary}`,
    customVoiceDescription: customDesc,
    speed,
    pitchRegister,
    emotionIntensity: energy > 72 ? 'natural' : 'subtle',
    expressiveControls: {
      warmth,
      energy,
      authority: pitchRegister === 'deep' ? 76 : 62,
      pauseStrength: 58,
    },
    masteringPreset: 'podcast',
    sampleRate: 48000,
    channels: 1,
    createdAt: new Date().toISOString(),
    isClone: true,
    clonedAt: new Date().toISOString(),
    sampleDurationMs: durationMs,
    cloneAcousticProfile: acousticProfile,
  };

  return { preset, durationMs };
}
