import type {
  GenerateRequestPayload,
  GenerateResponsePayload,
  WordTiming,
} from '../types';
import { validateGeneratePayload } from './speechLogic';

export function normalizeWordTimings(timings?: WordTiming[]): WordTiming[] {
  if (!Array.isArray(timings) || timings.length === 0) {
    return [];
  }

  let prevEndMs = 0;
  return timings
    .filter((item) => item && typeof item.word === 'string' && item.word.trim().length > 0)
    .map((item) => {
      const rawStartMs = Number.isFinite(item.startMs)
        ? item.startMs
        : Number.isFinite(item.startSeconds)
          ? Math.round(item.startSeconds * 1000)
          : prevEndMs;
      const startMs = Math.max(0, Math.round(rawStartMs));

      const rawEndMs = Number.isFinite(item.endMs)
        ? item.endMs
        : Number.isFinite(item.endSeconds)
          ? Math.round(item.endSeconds * 1000)
          : startMs + 120;
      const endMs = Math.max(startMs + 20, Math.round(rawEndMs));
      prevEndMs = endMs;

      const startSeconds = Number.isFinite(item.startSeconds)
        ? Number(item.startSeconds.toFixed(3))
        : Number((startMs / 1000).toFixed(3));
      const endSeconds = Number.isFinite(item.endSeconds)
        ? Number(Math.max(startSeconds + 0.02, item.endSeconds).toFixed(3))
        : Number((endMs / 1000).toFixed(3));

      return {
        word: item.word.trim(),
        startMs,
        endMs,
        startSeconds,
        endSeconds,
        ...(typeof item.segmentIndex === 'number' ? { segmentIndex: item.segmentIndex } : {}),
        ...(item.emotion ? { emotion: item.emotion } : {}),
      };
    });
}

export function buildFallbackWaveformPeaks(
  wordTimings?: WordTiming[],
  durationSeconds = 0,
  bucketCount = 96
): number[] {
  const safeCount = Math.max(16, bucketCount);
  const timings = normalizeWordTimings(wordTimings);
  const effectiveDuration =
    durationSeconds > 0
      ? durationSeconds
      : timings.length > 0
        ? timings[timings.length - 1].endSeconds
        : 1;

  if (timings.length === 0) {
    return Array.from({ length: safeCount }, (_, i) =>
      Number((0.22 + 0.45 * Math.abs(Math.sin(i * 0.45 + 0.7))).toFixed(3))
    );
  }

  return Array.from({ length: safeCount }, (_, idx) => {
    const tCenter = ((idx + 0.5) / safeCount) * effectiveDuration;
    const activeWord = timings.find(
      (w) => tCenter >= w.startSeconds && tCenter <= w.endSeconds
    );
    if (!activeWord) {
      return 0.08;
    }
    const wordSpan = Math.max(0.04, activeWord.endSeconds - activeWord.startSeconds);
    const localProgress = (tCenter - activeWord.startSeconds) / wordSpan;
    const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, localProgress)));
    const syllableMod = 0.72 + 0.28 * Math.abs(Math.sin(idx * 1.35 + activeWord.word.length));
    return Number(Math.max(0.14, Math.min(1, 0.25 + 0.75 * envelope * syllableMod)).toFixed(3));
  });
}

export function normalizeGenerateResponse(
  data: GenerateResponsePayload
): GenerateResponsePayload {
  const wordTimings = normalizeWordTimings(data.wordTimings);
  const durationSeconds =
    typeof data.durationMs === 'number' && data.durationMs > 0
      ? data.durationMs / 1000
      : data.durationEstimateSec || 0;

  const waveformPeaks =
    Array.isArray(data.waveformPeaks) && data.waveformPeaks.length > 0
      ? data.waveformPeaks.map((p) => Number(Math.max(0.04, Math.min(1, Number(p) || 0.04)).toFixed(3)))
      : buildFallbackWaveformPeaks(wordTimings, durationSeconds, 120);

  return {
    ...data,
    wordTimings,
    waveformPeaks,
  };
}

export async function generate(
  payload: GenerateRequestPayload,
  fetchImpl: typeof fetch = fetch
): Promise<GenerateResponsePayload> {
  const validation = validateGeneratePayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid speech generation parameters.');
  }

  const response = await fetchImpl('/api/tts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as GenerateResponsePayload & { error?: string };
  if (!response.ok || !data.audioBase64) {
    throw new Error(data.error || 'Speech generation failed.');
  }

  return normalizeGenerateResponse(data);
}

export const generateSpeech = generate;

export async function regenerateSegment(
  params: {
    clipId: string;
    segmentIndex: number;
    text: string;
    voiceId?: string;
    stylePrompt?: string;
    speed?: number;
  },
  fetchImpl: typeof fetch = fetch
): Promise<GenerateResponsePayload> {
  const response = await fetchImpl('/api/tts/segments/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await response.json()) as GenerateResponsePayload & { error?: string };
  if (!response.ok || !data.audioBase64) {
    throw new Error(data.error || 'Segment regeneration failed.');
  }

  return normalizeGenerateResponse(data);
}
