import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPronunciationRules,
  getEmotionStyleHint,
  splitScriptIntoSegments,
  stripInlinePerformanceTags,
} from './pronunciationAndEmotion';
import { alignWordsToEnvelope, generateSubtitles } from './subtitleGenerator';
import {
  applyMasteringPresetMono,
  encodeWavBuffer,
  extractSpeechEnvelope,
  normalizeMonoPcm,
  parseWavBuffer,
  processWavAudio,
  resampleMonoPcm,
  stitchWavBuffers,
  timeStretchMonoPcm,
  trimSilenceMono,
} from '../server/wavAudio';
import type { PronunciationEntry } from '../types';

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
});
