import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPronunciationRules,
  getEmotionStyleHint,
  splitScriptIntoSegments,
  stripInlinePerformanceTags,
} from './pronunciationAndEmotion';
import {
  alignWordsToEnvelope,
  alignWordsToWavPcm,
  generateSubtitles,
  generate_subtitles,
} from './subtitleGenerator';
import {
  applyMasteringPresetMono,
  encodeWavBuffer,
  extractSpeechEnvelope,
  extractWaveformPeaks,
  normalizeMonoPcm,
  parseWavBuffer,
  processWavAudio,
  resampleMonoPcm,
  stitchWavBuffers,
  timeStretchMonoPcm,
  trimSilenceMono,
} from '../server/wavAudio';
import {
  selectTtsModel,
  splitLongScriptIntoChunkPlans,
  splitLongScriptIntoChunks,
} from './speechLogic';
import {
  InputValidationError,
  QuotaExhaustedError,
  clearModelCooldowns,
  extractRetryAfterSeconds,
  isModelOnCooldown,
  isQuotaOrRateError,
  mapApiError,
  markModelCooldown,
} from '../server/quotaError';
import { generate, normalizeWordTimings } from './generateClient';
import type { GenerateRequestPayload, PronunciationEntry } from '../types';

function makeSineWav(sampleRate: number, durationSec: number, freqHz = 220, amp = 8000): Buffer {
  const totalSamples = Math.round(sampleRate * durationSec);
  const pcm = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    pcm[i] = Math.round(amp * Math.sin((2 * Math.PI * freqHz * i) / sampleRate));
  }
  return encodeWavBuffer(pcm, sampleRate, 1);
}

test('applyPronunciationRules substitutes English and Hindi terms while keeping caption text clean', () => {
  const rules: PronunciationEntry[] = [
    {
      id: 'r1',
      term: 'Leidenfrost',
      phonetic: 'LY-den-frost',
      ipa: 'ˈlaɪdənfrɒst',
      language: 'en',
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'r2',
      term: 'विद्युत',
      phonetic: 'विद्-युत',
      language: 'hi',
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'r3',
      term: 'ionosphere',
      phonetic: 'eye-ON-uh-sfeer',
      language: 'en',
      enabled: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const displayScript = 'The Leidenfrost effect happens near the ionosphere, और विद्युत चमकती है।';
  const result = applyPronunciationRules(displayScript, rules, 'bilingual');

  assert.match(result.ttsText, /LY-den-frost/);
  assert.match(result.ttsText, /विद्-युत/);
  assert.match(result.ttsText, /ionosphere/); // disabled rule untouched
  assert.deepEqual(result.appliedTerms, ['Leidenfrost', 'विद्युत']);
  assert.match(result.pronunciationPrompt, /Pronunciation guide:/);
  assert.match(result.pronunciationPrompt, /ˈlaɪdənfrɒst/);
  // Original display script stays untouched
  assert.match(displayScript, /Leidenfrost/);
});

test('splitScriptIntoSegments parses [EMOTION] tags cleanly and strips inline tags for display', () => {
  const script = `[CURIOUS] This lightning shoots upward.
[CHALLENGING] Wait, isn't lightning supposed to strike the ground?
[AWE] <sigh> Above the storm, blue jets pierce the stratosphere.`;

  const segments = splitScriptIntoSegments(script);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].emotion, 'CURIOUS');
  assert.equal(segments[0].displayText, 'This lightning shoots upward.');
  assert.equal(segments[1].emotion, 'CHALLENGING');
  assert.equal(segments[2].emotion, 'AWE');
  assert.equal(segments[2].displayText, 'Above the storm, blue jets pierce the stratosphere.');
  assert.ok(getEmotionStyleHint('AWE')?.includes('awed'));
  assert.equal(
    stripInlinePerformanceTags('[QUIET] Listen <breath> closely |dramatic| now.'),
    'Listen closely now.'
  );

  const inlineBetween = splitScriptIntoSegments(
    '[CURIOUS] This lightning shoots upward. <breath> [AWE] Above the storm clouds.'
  );
  assert.equal(inlineBetween.length, 2);
  assert.equal(inlineBetween[0].displayText, 'This lightning shoots upward.');
  assert.equal(inlineBetween[1].emotion, 'AWE');
  assert.equal(inlineBetween[1].rawText, '<breath> Above the storm clouds.');
});

test('alignWordsToEnvelope & generateSubtitles output SRT, VTT, JSON, and Rainbow Reels ASS', () => {
  const envelope = [
    { startMs: 0, endMs: 250, speechActive: false, rmsDb: -70, duckGainDb: 0 },
    { startMs: 250, endMs: 1450, speechActive: true, rmsDb: -16, duckGainDb: -14 },
    { startMs: 1450, endMs: 1700, speechActive: false, rmsDb: -65, duckGainDb: 0 },
    { startMs: 1700, endMs: 2800, speechActive: true, rmsDb: -15, duckGainDb: -14 },
  ];

  const { wordTimings } = alignWordsToEnvelope('This lightning shoots upward into space.', 2800, envelope);
  assert.equal(wordTimings.length, 6);
  assert.ok(wordTimings[0].startMs >= 250);
  assert.ok(wordTimings[wordTimings.length - 1].endMs <= 2800);
  for (let i = 1; i < wordTimings.length; i += 1) {
    assert.ok(wordTimings[i].startMs >= wordTimings[i - 1].startMs);
  }

  const srt = generateSubtitles({ wordTimings, format: 'srt', preset: 'rainbow_reels', maxLines: 2 });
  assert.match(srt, /1\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
  assert.match(srt, /THIS LIGHTNING/);

  const vtt = generateSubtitles({ wordTimings, format: 'vtt', preset: 'clean_editorial' });
  assert.match(vtt, /^WEBVTT/);

  const ass = generateSubtitles({
    wordTimings,
    format: 'ass',
    preset: 'rainbow_reels',
    maxLines: 3,
    maxCharsPerLine: 20,
  });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /&H00FFE500/); // cyan active highlight
  assert.match(ass, /&H00FFFFFF/); // white base text
  assert.match(ass, /\{\\kf\d+\}/); // karaoke highlight tags

  const jsonStr = generateSubtitles({ wordTimings, format: 'json', preset: 'rainbow_reels' });
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.wordTimings.length, 6);
  assert.ok(Array.isArray(parsed.phrases) && parsed.phrases.length >= 1);
});

test('wavAudio pipeline parses, trims silence, resamples 24kHz->48kHz, normalizes, time-stretches, and stitches', () => {
  // 24kHz mono sine wave with leading and trailing silence
  const leadSilence = new Int16Array(2400); // 100ms
  const toneSamples = new Int16Array(24000); // 1s at 24kHz
  for (let i = 0; i < toneSamples.length; i += 1) {
    toneSamples[i] = Math.round(4000 * Math.sin((2 * Math.PI * 220 * i) / 24000));
  }
  const combined = new Int16Array(leadSilence.length * 2 + toneSamples.length);
  combined.set(leadSilence, 0);
  combined.set(toneSamples, leadSilence.length);
  combined.set(leadSilence, leadSilence.length + toneSamples.length);

  const rawWav = encodeWavBuffer(combined, 24000, 1);
  const parsed = parseWavBuffer(rawWav);
  assert.equal(parsed.sampleRate, 24000);
  assert.equal(parsed.channels, 1);

  const trimmed = trimSilenceMono(parsed.pcm, 24000, -42, 20);
  assert.ok(trimmed.length < combined.length);

  const normalized = normalizeMonoPcm(trimmed);
  let peak = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    peak = Math.max(peak, Math.abs(normalized[i]));
  }
  assert.ok(peak > 6000 && peak <= 32767);

  const mastered = applyMasteringPresetMono(normalized, 24000, 'instagram_reel');
  assert.equal(mastered.length, normalized.length);

  const upsampled = resampleMonoPcm(normalized, 24000, 48000);
  assert.ok(Math.abs(upsampled.length - normalized.length * 2) <= 4);

  const processed = processWavAudio(rawWav, {
    targetSampleRate: 48000,
    targetChannels: 1,
    trimSilence: true,
    normalize: true,
    masteringPreset: 'youtube_narration',
  });
  assert.equal(processed.sampleRate, 48000);
  assert.equal(processed.channels, 1);
  assert.equal(processed.wavBuffer.toString('ascii', 0, 4), 'RIFF');
  assert.ok(processed.speechEnvelope.some((f) => f.speechActive));

  const stretched = timeStretchMonoPcm(upsampled, 48000, 1.25);
  assert.ok(stretched.length < upsampled.length * 0.9);

  const seg1 = makeSineWav(24000, 0.4, 220);
  const seg2 = makeSineWav(24000, 0.5, 330);
  const stitched = stitchWavBuffers([seg1, seg2], 120, 48000, 1);
  assert.equal(stitched.offsetsMs.length, 2);
  assert.ok(stitched.offsetsMs[1].startMs > stitched.offsetsMs[0].endMs);
  assert.ok(stitched.durationMs >= 900);

  const env = extractSpeechEnvelope(upsampled, 48000, 1, 25);
  assert.ok(env.length > 10);

  const peaks = extractWaveformPeaks(upsampled, 1, 80);
  assert.equal(peaks.length, 80);
  assert.ok(peaks.every((p) => p >= 0.04 && p <= 1));
});

test('splitLongScriptIntoChunks splits >10,000 char scripts cleanly and keeps bracket cues on high-quota standard model', () => {
  const paragraph = 'This lightning shoots upward into the stratosphere. '.repeat(45);
  const longScript = [paragraph, paragraph, paragraph, paragraph, paragraph].join('\n\n');
  assert.ok(longScript.length > 10000);

  const chunks = splitLongScriptIntoChunks(longScript, 3500);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 3500 && c.length > 0));

  const standardBracketModel = selectTtsModel({
    mode: 'single',
    modelTier: 'standard',
    text: '[CURIOUS] Why does lightning shoot upward above thunderclouds?',
  });
  assert.equal(standardBracketModel, 'gemini-3.8-flash-lite-tts');
});

test('generate utility normalizes word-level start/end offsets and waveformPeaks from GenerateResponsePayload', async () => {
  const mockPayload: GenerateRequestPayload = {
    mode: 'single',
    language: 'en',
    modelTier: 'standard',
    text: 'This lightning shoots upward.',
    voiceName: 'Charon',
    stylePrompt: 'Curious narrator',
    speed: 1.0,
  };

  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        clipId: 'clip_test_1',
        audioBase64: 'UklGRg==',
        mimeType: 'audio/wav',
        modelUsed: 'gemini-3.8-flash-lite-tts',
        durationEstimateSec: 1.4,
        durationMs: 1400,
        wordTimings: [
          { word: 'This', startMs: 0, endMs: 220 },
          { word: 'lightning', startMs: 240, endMs: 650 },
          { word: 'shoots', startMs: 670, endMs: 960 },
          { word: 'upward.', startMs: 980, endMs: 1380 },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const result = await generate(mockPayload, fakeFetch);
  assert.equal(result.modelUsed, 'gemini-3.8-flash-lite-tts');
  assert.equal(result.timingSource, 'forced_alignment');
  assert.equal(result.wordTimings?.length, 4);
  assert.deepEqual(result.wordTimings?.[1], {
    word: 'lightning',
    startMs: 240,
    endMs: 650,
    startSeconds: 0.24,
    endSeconds: 0.65,
  });
  assert.ok(Array.isArray(result.waveformPeaks) && result.waveformPeaks.length === 120);

  const directNormalized = normalizeWordTimings([
    { word: 'Hello', startMs: 100, endMs: 420, startSeconds: 0.1, endSeconds: 0.42 },
  ]);
  assert.equal(directNormalized[0].startSeconds, 0.1);
  assert.equal(directNormalized[0].endSeconds, 0.42);
});

test('quotaError detects nested 429 / quota / rate-limit errors, tracks cooldowns, and never maps 429 to INVALID_ARGUMENT', () => {
  clearModelCooldowns();

  const nestedCauseErr = {
    message: 'Request failed',
    cause: {
      response: {
        data: {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'You exceeded your current quota. Please retry in 45s.',
          },
        },
      },
    },
  };
  assert.equal(isQuotaOrRateError(nestedCauseErr), true);
  assert.equal(extractRetryAfterSeconds(nestedCauseErr), 45);

  const mapped429 = mapApiError(nestedCauseErr);
  assert.equal(mapped429.status, 429);
  assert.equal(mapped429.error_code, 'RESOURCE_EXHAUSTED');
  assert.equal(mapped429.retryable, true);
  assert.equal(mapped429.retryAfterSeconds, 45);

  const rateLimitStrErr = new Error('Provider rate limit exceeded for tier');
  assert.equal(isQuotaOrRateError(rateLimitStrErr), true);
  assert.equal(mapApiError(rateLimitStrErr).error_code, 'RESOURCE_EXHAUSTED');

  const qErr = new QuotaExhaustedError({
    attemptedModels: ['gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'],
    retryAfterSeconds: 120,
  });
  const qMapped = mapApiError(qErr);
  assert.equal(qMapped.status, 429);
  assert.equal(qMapped.error_code, 'RESOURCE_EXHAUSTED');
  assert.deepEqual(qMapped.attemptedModels, [
    'gemini-3.8-flash-lite-tts',
    'gemini-2.5-flash-preview-tts',
  ]);

  const badInputErr = new InputValidationError('Empty script');
  assert.equal(mapApiError(badInputErr).status, 400);
  assert.equal(mapApiError(badInputErr).error_code, 'INVALID_ARGUMENT');

  markModelCooldown('gemini-3.8-flash-lite-tts', 30);
  assert.equal(isModelOnCooldown('gemini-3.8-flash-lite-tts'), true);
  clearModelCooldowns();
  assert.equal(isModelOnCooldown('gemini-3.8-flash-lite-tts'), false);
});

test('alignWordsToWavPcm performs real PCM forced alignment and generate_subtitles respects maxLines & maxDurationSeconds', () => {
  const sampleRate = 24000;
  const totalSamples = sampleRate * 2; // 2.0s
  const pcm = new Int16Array(totalSamples);

  // Create two distinct voiced pulses separated by a quiet silence gap:
  // Pulse 1: 0.10s..0.80s ("Hello world")
  // Silence: 0.80s..1.10s
  // Pulse 2: 1.10s..1.85s ("Svara speaks")
  for (let i = Math.round(0.1 * sampleRate); i < Math.round(0.8 * sampleRate); i += 1) {
    pcm[i] = Math.round(12000 * Math.sin((2 * Math.PI * 240 * i) / sampleRate));
  }
  for (let i = Math.round(1.1 * sampleRate); i < Math.round(1.85 * sampleRate); i += 1) {
    pcm[i] = Math.round(12000 * Math.sin((2 * Math.PI * 260 * i) / sampleRate));
  }

  const aligned = alignWordsToWavPcm('Hello world, Svara speaks!', pcm, sampleRate, 1);
  assert.equal(aligned.timingSource, 'forced_alignment');
  assert.ok(aligned.timingConfidence >= 0.75);
  assert.equal(aligned.wordTimings.length, 4);
  assert.ok(aligned.wordTimings[0].startMs >= 80);
  assert.ok(aligned.wordTimings[2].startMs >= 1050);

  const srt = generate_subtitles({
    wordTimings: aligned.wordTimings,
    format: 'srt',
    preset: 'clean_editorial',
    maxLines: 1,
    maxDurationSeconds: 1.0,
  });
  assert.match(srt, /-->/);
  assert.match(srt, /Hello world,/);

  const vtt = generate_subtitles({
    wordTimings: aligned.wordTimings,
    format: 'vtt',
    maxLines: 2,
    maxDurationSeconds: 1.5,
  });
  assert.match(vtt, /^WEBVTT/);
});

test('splitLongScriptIntoChunkPlans preserves paragraph pauses and active [EMOTION] tags', () => {
  const longPara = 'Lightning rises upward from thunderclouds toward the ionosphere. '.repeat(70);
  const script = `[CURIOUS] ${longPara}\n\n[AWE] Above the storm, blue jets pierce the stratosphere.`;
  const plans = splitLongScriptIntoChunkPlans(script, 1500);
  assert.ok(plans.length >= 3);
  assert.equal(plans[0].emotion, 'CURIOUS');
  assert.equal(plans[plans.length - 1].emotion, 'AWE');
  assert.ok(plans[0].breakAfterMs > 0);
  assert.equal(plans[plans.length - 1].breakAfterMs, 0);
});

