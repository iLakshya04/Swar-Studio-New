import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  AudioFormat,
  ChannelCount,
  MasteringPreset,
  SampleRateHz,
  SpeechEnvelopeInterval,
} from '../types';

const execFileAsync = promisify(execFile);

export interface ParsedWav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Int16Array; // interleaved if stereo
  durationMs: number;
}

export function parseWavBuffer(buffer: Buffer): ParsedWav {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    // Treat as raw 24kHz mono 16-bit PCM fallback
    const sampleCount = Math.floor(buffer.length / 2);
    const pcm = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      pcm[i] = buffer.readInt16LE(i * 2);
    }
    return {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      pcm,
      durationMs: Math.round((sampleCount / 24000) * 1000),
    };
  }

  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataStart = 44;
  let dataSize = Math.max(0, buffer.length - 44);

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;

    if (chunkId === 'fmt ' && payloadOffset + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(payloadOffset + 2) || 1;
      sampleRate = buffer.readUInt32LE(payloadOffset + 4) || 24000;
      bitsPerSample = buffer.readUInt16LE(payloadOffset + 14) || 16;
    } else if (chunkId === 'data') {
      dataStart = payloadOffset;
      dataSize = Math.min(chunkSize, Math.max(0, buffer.length - payloadOffset));
      break;
    }

    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }

  const bytesPerSample = Math.max(2, Math.floor(bitsPerSample / 8));
  const sampleCount = Math.floor(dataSize / bytesPerSample);
  const pcm = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    const bytePos = dataStart + i * bytesPerSample;
    if (bytePos + 1 < buffer.length) {
      pcm[i] = buffer.readInt16LE(bytePos);
    }
  }

  const frames = Math.floor(sampleCount / Math.max(1, channels));
  const durationMs = Math.round((frames / Math.max(1, sampleRate)) * 1000);

  return { sampleRate, channels, bitsPerSample, pcm, durationMs };
}

export function encodeWavBuffer(
  pcm: Int16Array,
  sampleRate: number,
  channels: ChannelCount = 1
): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk length
  header.writeUInt16LE(1, 20); // Linear PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const dataBuf = Buffer.allocUnsafe(dataSize);
  for (let i = 0; i < pcm.length; i += 1) {
    dataBuf.writeInt16LE(pcm[i], i * 2);
  }

  return Buffer.concat([header, dataBuf]);
}

export function toMonoPcm(pcm: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return pcm;
  const frames = Math.floor(pcm.length / channels);
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += pcm[f * channels + c];
    }
    out[f] = Math.round(sum / channels);
  }
  return out;
}

export function toChannelCount(monoPcm: Int16Array, channels: ChannelCount): Int16Array {
  if (channels === 1) return monoPcm;
  const out = new Int16Array(monoPcm.length * 2);
  for (let i = 0; i < monoPcm.length; i += 1) {
    out[i * 2] = monoPcm[i];
    out[i * 2 + 1] = monoPcm[i];
  }
  return out;
}

export function trimSilenceMono(
  pcm: Int16Array,
  sampleRate: number,
  thresholdDb = -42,
  padMs = 60
): Int16Array {
  if (pcm.length === 0) return pcm;
  const thresholdAmp = Math.pow(10, thresholdDb / 20) * 32767;
  const winSize = Math.max(64, Math.round(sampleRate * 0.01)); // 10ms
  const padSamples = Math.round((padMs / 1000) * sampleRate);

  let firstActive = -1;
  let lastActive = -1;

  for (let start = 0; start < pcm.length; start += winSize) {
    const end = Math.min(pcm.length, start + winSize);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const abs = Math.abs(pcm[i]);
      if (abs > peak) peak = abs;
    }
    if (peak >= thresholdAmp) {
      if (firstActive === -1) firstActive = start;
      lastActive = end;
    }
  }

  if (firstActive === -1 || lastActive === -1) {
    return pcm;
  }

  const trimmedStart = Math.max(0, firstActive - padSamples);
  const trimmedEnd = Math.min(pcm.length, lastActive + padSamples);
  return pcm.slice(trimmedStart, trimmedEnd);
}

export function normalizeMonoPcm(
  pcm: Int16Array,
  targetPeakDb = -1.0,
  targetRmsDb = -16.0
): Int16Array {
  if (pcm.length === 0) return pcm;
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const v = pcm[i];
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
  }
  if (peak < 16) return pcm;

  const rms = Math.sqrt(sumSq / pcm.length);
  const desiredPeak = Math.pow(10, targetPeakDb / 20) * 32767;
  const desiredRms = Math.pow(10, targetRmsDb / 20) * 32767;

  const peakGain = desiredPeak / peak;
  const rmsGain = rms > 1 ? desiredRms / rms : peakGain;
  const gain = Math.min(peakGain * 1.35, Math.max(0.5, Math.min(rmsGain, 4.0)));

  const out = new Int16Array(pcm.length);
  const ceiling = desiredPeak;
  for (let i = 0; i < pcm.length; i += 1) {
    const scaled = pcm[i] * gain;
    if (Math.abs(scaled) <= ceiling) {
      out[i] = Math.round(scaled);
    } else {
      // Soft knee limiting above ceiling
      const sign = scaled < 0 ? -1 : 1;
      const excess = (Math.abs(scaled) - ceiling) / 32767;
      const limited = ceiling + (32767 - ceiling) * Math.tanh(excess * 2.5);
      out[i] = Math.round(sign * Math.min(32767, limited));
    }
  }
  return out;
}

export function applyMasteringPresetMono(
  pcm: Int16Array,
  sampleRate: number,
  preset: MasteringPreset
): Int16Array {
  if (preset === 'none' || pcm.length < 4) return pcm;

  // High-pass rumble filter (~85 Hz) + mild vocal presence shelf + preset loudness target
  const out = new Float64Array(pcm.length);
  const rc = 1 / (2 * Math.PI * 85);
  const dt = 1 / Math.max(8000, sampleRate);
  const alpha = rc / (rc + dt);

  let prevIn = pcm[0];
  let prevHp = 0;
  let prevLp = pcm[0];

  const warmthWeight = preset === 'podcast' || preset === 'audiobook' ? 0.14 : 0.06;
  const presenceBoost = preset === 'instagram_reel' ? 0.18 : preset === 'youtube_narration' ? 0.12 : 0.06;

  for (let i = 0; i < pcm.length; i += 1) {
    const x = pcm[i];
    const hp = alpha * (prevHp + x - prevIn);
    prevIn = x;
    prevHp = hp;

    // 1-pole low-pass at ~350 Hz for subtle body
    const lp = prevLp + 0.045 * (hp - prevLp);
    prevLp = lp;

    // Mild high-frequency presence via difference
    const high = hp - lp;
    out[i] = hp + warmthWeight * lp + presenceBoost * high;
  }

  const intOut = new Int16Array(pcm.length);
  for (let i = 0; i < out.length; i += 1) {
    intOut[i] = Math.max(-32767, Math.min(32767, Math.round(out[i])));
  }

  const targetRmsDb =
    preset === 'instagram_reel'
      ? -13.5
      : preset === 'youtube_narration'
        ? -14.5
        : preset === 'podcast'
          ? -15.5
          : -17.5;

  return normalizeMonoPcm(intOut, -0.8, targetRmsDb);
}

export function resampleMonoPcm(
  pcm: Int16Array,
  fromRate: number,
  toRate: number
): Int16Array {
  if (fromRate === toRate || pcm.length < 2) return pcm;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(pcm.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = pcm[Math.min(idx, pcm.length - 1)];
    const s1 = pcm[Math.min(idx + 1, pcm.length - 1)];
    out[i] = Math.round(s0 + (s1 - s0) * frac);
  }
  return out;
}

/**
 * Pure-TS overlap-add time stretching (WSOLA-lite) so tempo changes preserve vocal pitch.
 * speedFactor > 1.0 makes audio faster/shorter; speedFactor < 1.0 makes audio slower/longer.
 */
export function timeStretchMonoPcm(
  pcm: Int16Array,
  sampleRate: number,
  speedFactor: number
): Int16Array {
  const clampedFactor = Math.max(0.65, Math.min(1.6, speedFactor));
  if (Math.abs(clampedFactor - 1.0) < 0.015 || pcm.length < sampleRate * 0.1) {
    return pcm;
  }

  const winSize = Math.max(256, Math.round(sampleRate * 0.032)); // 32ms Hann window
  const synthesisHop = Math.floor(winSize / 2);
  const analysisHop = Math.max(16, Math.round(synthesisHop * clampedFactor));

  const outLen = Math.max(winSize, Math.round(pcm.length / clampedFactor));
  const accum = new Float64Array(outLen + winSize);
  const norm = new Float64Array(outLen + winSize);

  const hann = new Float64Array(winSize);
  for (let i = 0; i < winSize; i += 1) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  let inPos = 0;
  let outPos = 0;
  const searchRadius = Math.floor(winSize / 4);

  while (inPos + winSize < pcm.length && outPos + winSize < accum.length) {
    let bestInPos = inPos;
    if (outPos > 0) {
      // Tiny cross-correlation search for smooth phase alignment
      let bestScore = -Infinity;
      const minP = Math.max(0, inPos - searchRadius);
      const maxP = Math.min(pcm.length - winSize - 1, inPos + searchRadius);
      for (let cand = minP; cand <= maxP; cand += 4) {
        let corr = 0;
        for (let k = 0; k < synthesisHop; k += 4) {
          corr += accum[outPos + k] * pcm[cand + k];
        }
        if (corr > bestScore) {
          bestScore = corr;
          bestInPos = cand;
        }
      }
    }

    for (let i = 0; i < winSize; i += 1) {
      const w = hann[i];
      accum[outPos + i] += pcm[bestInPos + i] * w;
      norm[outPos + i] += w;
    }

    inPos += analysisHop;
    outPos += synthesisHop;
  }

  const finalLen = Math.min(outLen, outPos + synthesisHop);
  const out = new Int16Array(finalLen);
  for (let i = 0; i < finalLen; i += 1) {
    const val = norm[i] > 1e-4 ? accum[i] / norm[i] : accum[i];
    out[i] = Math.max(-32767, Math.min(32767, Math.round(val)));
  }
  return out;
}

export function extractSpeechEnvelope(
  pcm: Int16Array,
  sampleRate: number,
  channels = 1,
  frameMs = 25
): SpeechEnvelopeInterval[] {
  const mono = channels > 1 ? toMonoPcm(pcm, channels) : pcm;
  if (mono.length === 0) return [];
  const frameSamples = Math.max(64, Math.round((sampleRate * frameMs) / 1000));
  const intervals: SpeechEnvelopeInterval[] = [];

  for (let start = 0; start < mono.length; start += frameSamples) {
    const end = Math.min(mono.length, start + frameSamples);
    let sumSq = 0;
    for (let i = start; i < end; i += 1) {
      const normSample = mono[i] / 32767;
      sumSq += normSample * normSample;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    const rmsDb = rms > 1e-6 ? Number((20 * Math.log10(rms)).toFixed(1)) : -96;
    const speechActive = rmsDb > -38;
    const duckGainDb = speechActive ? -14 : 0;

    intervals.push({
      startMs: Math.round((start / sampleRate) * 1000),
      endMs: Math.round((end / sampleRate) * 1000),
      speechActive,
      rmsDb,
      duckGainDb,
    });
  }

  return intervals;
}

export interface ProcessAudioOptions {
  targetSampleRate?: SampleRateHz;
  targetChannels?: ChannelCount;
  trimSilence?: boolean;
  normalize?: boolean;
  masteringPreset?: MasteringPreset;
  targetDurationSeconds?: number;
  durationToleranceSeconds?: number;
  fitMode?: 'natural' | 'tight' | 'stretch';
}

export interface ProcessedWavResult {
  wavBuffer: Buffer;
  sampleRate: SampleRateHz;
  channels: ChannelCount;
  durationMs: number;
  speechEnvelope: SpeechEnvelopeInterval[];
}

export function processWavAudio(
  rawWavBuffer: Buffer,
  options: ProcessAudioOptions = {}
): ProcessedWavResult {
  const parsed = parseWavBuffer(rawWavBuffer);
  let mono = toMonoPcm(parsed.pcm, parsed.channels);

  if (options.trimSilence !== false) {
    mono = trimSilenceMono(mono, parsed.sampleRate);
  }

  // Duration fitting if targetDurationSeconds is specified
  if (
    typeof options.targetDurationSeconds === 'number' &&
    options.targetDurationSeconds > 0.3 &&
    options.fitMode !== 'natural'
  ) {
    const currentSec = mono.length / Math.max(1, parsed.sampleRate);
    const tol = options.durationToleranceSeconds ?? 0.35;
    const diff = Math.abs(currentSec - options.targetDurationSeconds);
    if (diff > tol) {
      const factor = currentSec / options.targetDurationSeconds;
      if (options.fitMode === 'stretch' || factor >= 0.78) {
        mono = timeStretchMonoPcm(mono, parsed.sampleRate, factor);
      } else {
        // Trim excess trailing silence or pad gentle silence if requested tight
        const targetSamples = Math.round(options.targetDurationSeconds * parsed.sampleRate);
        if (mono.length > targetSamples) {
          mono = timeStretchMonoPcm(mono, parsed.sampleRate, factor);
        } else {
          const padded = new Int16Array(targetSamples);
          padded.set(mono, 0);
          mono = padded;
        }
      }
    }
  }

  const targetRate: SampleRateHz = options.targetSampleRate || 48000;
  if (parsed.sampleRate !== targetRate) {
    mono = resampleMonoPcm(mono, parsed.sampleRate, targetRate);
  }

  const preset = options.masteringPreset || 'none';
  if (preset !== 'none') {
    mono = applyMasteringPresetMono(mono, targetRate, preset);
  } else if (options.normalize !== false) {
    mono = normalizeMonoPcm(mono);
  }

  const targetChannels: ChannelCount = options.targetChannels === 2 ? 2 : 1;
  const finalPcm = toChannelCount(mono, targetChannels);
  const wavBuffer = encodeWavBuffer(finalPcm, targetRate, targetChannels);
  const durationMs = Math.round((mono.length / targetRate) * 1000);
  const speechEnvelope = extractSpeechEnvelope(mono, targetRate, 1, 25);

  return {
    wavBuffer,
    sampleRate: targetRate,
    channels: targetChannels,
    durationMs,
    speechEnvelope,
  };
}

export function stitchWavBuffers(
  wavBuffers: Buffer[],
  gapMs = 160,
  targetRate: SampleRateHz = 48000,
  targetChannels: ChannelCount = 1
): {
  wavBuffer: Buffer;
  durationMs: number;
  offsetsMs: Array<{ startMs: number; endMs: number }>;
  speechEnvelope: SpeechEnvelopeInterval[];
} {
  const gapSamples = Math.max(0, Math.round((gapMs / 1000) * targetRate));
  const monoSegments: Int16Array[] = [];
  const offsetsMs: Array<{ startMs: number; endMs: number }> = [];

  let totalSamples = 0;
  for (let i = 0; i < wavBuffers.length; i += 1) {
    const parsed = parseWavBuffer(wavBuffers[i]);
    let mono = toMonoPcm(parsed.pcm, parsed.channels);
    mono = trimSilenceMono(mono, parsed.sampleRate, -44, 40);
    if (parsed.sampleRate !== targetRate) {
      mono = resampleMonoPcm(mono, parsed.sampleRate, targetRate);
    }
    const startMs = Math.round((totalSamples / targetRate) * 1000);
    totalSamples += mono.length;
    const endMs = Math.round((totalSamples / targetRate) * 1000);
    offsetsMs.push({ startMs, endMs });
    monoSegments.push(mono);
    if (i < wavBuffers.length - 1) {
      totalSamples += gapSamples;
    }
  }

  const combinedMono = new Int16Array(totalSamples);
  let cursor = 0;
  for (let i = 0; i < monoSegments.length; i += 1) {
    combinedMono.set(monoSegments[i], cursor);
    cursor += monoSegments[i].length;
    if (i < monoSegments.length - 1) {
      cursor += gapSamples;
    }
  }

  const normalized = normalizeMonoPcm(combinedMono);
  const finalPcm = toChannelCount(normalized, targetChannels);
  const wavBuffer = encodeWavBuffer(finalPcm, targetRate, targetChannels);
  const durationMs = Math.round((normalized.length / targetRate) * 1000);
  const speechEnvelope = extractSpeechEnvelope(normalized, targetRate, 1, 25);

  return { wavBuffer, durationMs, offsetsMs, speechEnvelope };
}

export function getAudioMimeType(format: AudioFormat): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/wav';
  }
}

export async function transcodeWavToFormat(
  wavBuffer: Buffer,
  format: AudioFormat,
  bitrateKbps = 192
): Promise<{ buffer: Buffer; mimeType: string; actualFormat: AudioFormat }> {
  if (format === 'wav') {
    return { buffer: wavBuffer, mimeType: 'audio/wav', actualFormat: 'wav' };
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svara-encode-'));
  const inPath = path.join(tmpDir, 'input.wav');
  const outPath = path.join(tmpDir, `output.${format}`);

  try {
    await fs.writeFile(inPath, wavBuffer);
    const args = ['-y', '-i', inPath];
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`);
    } else if (format === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', `${bitrateKbps}k`, '-movflags', '+faststart');
    } else if (format === 'flac') {
      args.push('-c:a', 'flac');
    }
    args.push(outPath);

    await execFileAsync('ffmpeg', args, { timeout: 25000 });
    const outBuffer = await fs.readFile(outPath);
    return {
      buffer: outBuffer,
      mimeType: getAudioMimeType(format),
      actualFormat: format,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
