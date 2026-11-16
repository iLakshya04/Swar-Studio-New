import type {
  PhraseTiming,
  SpeechEnvelopeInterval,
  SubtitleFormat,
  SubtitlePreset,
  WordTiming,
} from '../types';
import { splitScriptIntoSegments, stripInlinePerformanceTags } from './pronunciationAndEmotion';

const VOWEL_RUN_RE = /[aeiouy]+|[\u0905-\u0914\u093E-\u094C\u0962-\u0963]/gi;

export function estimateWordWeight(word: string): number {
  const clean = word.replace(/[^\p{L}\p{N}]/gu, '');
  if (!clean) return 1;
  const vowelRuns = clean.match(VOWEL_RUN_RE)?.length ?? 0;
  const lenFactor = Math.max(1, Math.sqrt(clean.length));
  const punctuationPause = /[.!?।]$/.test(word) ? 1.8 : /[,;:—-]$/.test(word) ? 0.9 : 0;
  return Math.max(1.1, vowelRuns * 0.8 + lenFactor * 0.65 + punctuationPause);
}

/**
 * Aligns spoken words from `displayText` to active acoustic speech windows
 * inside `envelope` (or uniform timeline if envelope has no active frames).
 */
export function alignWordsToEnvelope(
  displayText: string,
  durationMs: number,
  envelope: SpeechEnvelopeInterval[] = []
): { wordTimings: WordTiming[]; phraseTimings: PhraseTiming[] } {
  const safeDurationMs = Math.max(200, Math.round(durationMs));
  const segments = splitScriptIntoSegments(displayText);

  const tokens: Array<{ word: string; segmentIndex: number; emotion?: string; weight: number }> = [];
  if (segments.length > 0) {
    for (const seg of segments) {
      const cleaned = stripInlinePerformanceTags(seg.displayText);
      const words = cleaned.split(/\s+/).filter(Boolean);
      for (const w of words) {
        tokens.push({
          word: w,
          segmentIndex: seg.index,
          emotion: seg.emotion,
          weight: estimateWordWeight(w),
        });
      }
    }
  } else {
    const cleaned = stripInlinePerformanceTags(displayText);
    for (const w of cleaned.split(/\s+/).filter(Boolean)) {
      tokens.push({ word: w, segmentIndex: 0, weight: estimateWordWeight(w) });
    }
  }

  if (tokens.length === 0) {
    return { wordTimings: [], phraseTimings: [] };
  }

  // Merge contiguous speechActive envelope windows (bridging brief <120ms micro-gaps)
  const mergedWindows: Array<{ startMs: number; endMs: number }> = [];
  for (const frame of envelope) {
    if (!frame.speechActive) continue;
    const prev = mergedWindows[mergedWindows.length - 1];
    if (prev && frame.startMs - prev.endMs <= 120) {
      prev.endMs = frame.endMs;
    } else {
      mergedWindows.push({ startMs: frame.startMs, endMs: frame.endMs });
    }
  }

  const activeWindows =
    mergedWindows.length > 0
      ? mergedWindows
      : [{ startMs: 0, endMs: safeDurationMs }];

  const totalActiveMs = activeWindows.reduce((acc, w) => acc + Math.max(20, w.endMs - w.startMs), 0);
  const totalWeight = tokens.reduce((acc, t) => acc + t.weight, 0);

  // Map a fractional active-time offset [0..totalActiveMs] onto wall-clock [startMs..endMs]
  const mapActiveOffsetToMs = (offsetMs: number): number => {
    let remaining = Math.max(0, Math.min(totalActiveMs, offsetMs));
    for (const win of activeWindows) {
      const span = Math.max(20, win.endMs - win.startMs);
      if (remaining <= span) {
        return Math.round(win.startMs + remaining);
      }
      remaining -= span;
    }
    return activeWindows[activeWindows.length - 1].endMs;
  };

  const wordTimings: WordTiming[] = [];
  let cursorWeight = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const startOffset = (cursorWeight / totalWeight) * totalActiveMs;
    cursorWeight += token.weight;
    const endOffset = (cursorWeight / totalWeight) * totalActiveMs;

    const rawStartMs = mapActiveOffsetToMs(startOffset);
    const rawEndMs = Math.max(rawStartMs + 40, mapActiveOffsetToMs(endOffset));
    const clampedEndMs = Math.min(safeDurationMs, rawEndMs);
    const clampedStartMs = Math.min(rawStartMs, Math.max(0, clampedEndMs - 30));

    wordTimings.push({
      word: token.word,
      startMs: clampedStartMs,
      endMs: clampedEndMs,
      startSeconds: Number((clampedStartMs / 1000).toFixed(3)),
      endSeconds: Number((clampedEndMs / 1000).toFixed(3)),
      segmentIndex: token.segmentIndex,
      emotion: token.emotion,
    });
  }

  const phraseTimings = groupWordsIntoPhrases(wordTimings, {
    maxLines: 2,
    maxCharsPerLine: 34,
    maxPhraseDurationMs: 3200,
  });

  return { wordTimings, phraseTimings };
}

export interface SubtitleCueOptions {
  maxLines?: 1 | 2 | 3;
  maxCharsPerLine?: number;
  maxPhraseDurationMs?: number;
  uppercase?: boolean;
}

function wrapWordsToLines(words: string[], maxCharsPerLine: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

export function groupWordsIntoPhrases(
  wordTimings: WordTiming[],
  opts: SubtitleCueOptions = {}
): PhraseTiming[] {
  if (!wordTimings.length) return [];
  const maxLines = opts.maxLines ?? 3;
  const maxCharsPerLine = Math.max(12, opts.maxCharsPerLine ?? 26);
  const maxTotalChars = maxLines * maxCharsPerLine;
  const maxPhraseDurationMs = Math.max(800, opts.maxPhraseDurationMs ?? 3000);

  const phrases: PhraseTiming[] = [];
  let bucket: WordTiming[] = [];
  let bucketChars = 0;

  const flushBucket = () => {
    if (bucket.length === 0) return;
    const rawWords = bucket.map((b) => (opts.uppercase ? b.word.toUpperCase() : b.word));
    const wrapped = wrapWordsToLines(rawWords, maxCharsPerLine, maxLines);
    phrases.push({
      text: wrapped.join('\n'),
      startMs: bucket[0].startMs,
      endMs: bucket[bucket.length - 1].endMs,
      words: bucket,
    });
    bucket = [];
    bucketChars = 0;
  };

  for (const wt of wordTimings) {
    const prev = bucket[bucket.length - 1];
    const nextChars = bucketChars + (bucket.length > 0 ? 1 : 0) + wt.word.length;
    const nextDur = bucket.length > 0 ? wt.endMs - bucket[0].startMs : 0;
    const segmentChanged = prev && prev.segmentIndex !== wt.segmentIndex;
    const prevEndedSentence = prev && /[.!?।]$/.test(prev.word);
    const largeGap = prev && wt.startMs - prev.endMs > 550;

    if (
      bucket.length > 0 &&
      (segmentChanged ||
        prevEndedSentence ||
        largeGap ||
        nextChars > maxTotalChars ||
        nextDur > maxPhraseDurationMs)
    ) {
      flushBucket();
    }

    bucket.push(wt);
    bucketChars += (bucket.length > 1 ? 1 : 0) + wt.word.length;
  }

  flushBucket();
  return phrases;
}

function formatSrtTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hrs = Math.floor(safe / 3600000);
  const mins = Math.floor((safe % 3600000) / 60000);
  const secs = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function formatVttTime(ms: number): string {
  return formatSrtTime(ms).replace(',', '.');
}

function formatAssTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hrs = Math.floor(safe / 3600000);
  const mins = Math.floor((safe % 3600000) / 60000);
  const secs = Math.floor((safe % 60000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export interface GenerateSubtitlesOptions {
  wordTimings: WordTiming[];
  format: SubtitleFormat;
  preset?: SubtitlePreset;
  maxLines?: 1 | 2 | 3;
  maxCharsPerLine?: number;
  maxPhraseDurationMs?: number;
  safeAreaMarginV?: number;
  uppercase?: boolean;
}

export function generateSubtitles(opts: GenerateSubtitlesOptions): string {
  const isRainbow = (opts.preset ?? 'rainbow_reels') === 'rainbow_reels';
  const uppercase = opts.uppercase ?? isRainbow;
  const maxLines = opts.maxLines ?? (isRainbow ? 3 : 2);
  const maxCharsPerLine = opts.maxCharsPerLine ?? (isRainbow ? 22 : 38);
  const maxPhraseDurationMs = opts.maxPhraseDurationMs ?? (isRainbow ? 2600 : 3800);
  const marginV = opts.safeAreaMarginV ?? (isRainbow ? 340 : 120);

  const phrases = groupWordsIntoPhrases(opts.wordTimings, {
    maxLines,
    maxCharsPerLine,
    maxPhraseDurationMs,
    uppercase,
  });

  if (opts.format === 'json') {
    return JSON.stringify(
      {
        preset: opts.preset ?? 'rainbow_reels',
        wordTimings: opts.wordTimings,
        phrases,
      },
      null,
      2
    );
  }

  if (opts.format === 'srt') {
    return phrases
      .map(
        (p, idx) =>
          `${idx + 1}\n${formatSrtTime(p.startMs)} --> ${formatSrtTime(p.endMs)}\n${p.text}`
      )
      .join('\n\n');
  }

  if (opts.format === 'vtt') {
    const cues = phrases
      .map((p) => `${formatVttTime(p.startMs)} --> ${formatVttTime(p.endMs)}\n${p.text}`)
      .join('\n\n');
    return `WEBVTT\n\n${cues}`;
  }

  // ASS subtitle format — Rainbow Reels preset uses white upcoming text (&H00FFFFFF)
  // and cyan (#00E5FF -> BGR &H00FFE500) active spoken karaoke fill (\kf), vertical 1080x1920 safe zone.
  const playResX = isRainbow ? 1080 : 1920;
  const playResY = isRainbow ? 1920 : 1080;
  const fontSize = isRainbow ? 74 : 58;
  // ASS color format is &HAABBGGRR. Cyan #00E5FF => R=00, G=E5, B=FF => &H00FFE500
  const primaryColour = isRainbow ? '&H00FFE500' : '&H00FFFFFF';
  const secondaryColour = '&H00FFFFFF';

  const header = [
    '[Script Info]',
    `Title: Svara Studio Captions (${isRainbow ? 'Rainbow Reels' : 'Clean Editorial'})`,
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Plus Jakarta Sans,${fontSize},${primaryColour},${secondaryColour},&H00090D16,&H80000000,-1,0,0,0,100,100,1,0,1,5,2,2,72,72,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events = phrases.map((phrase) => {
    const start = formatAssTime(phrase.startMs);
    const end = formatAssTime(phrase.endMs);
    // Preserve wrapped line breaks by mapping wrapped words back to wordTimings with \kf durations
    const lines = phrase.text.split('\n');
    let wordCursor = 0;
    const assLines = lines.map((lineText) => {
      const lineWords = lineText.split(' ').filter(Boolean);
      return lineWords
        .map((displayWord) => {
          const wt = phrase.words[wordCursor];
          wordCursor += 1;
          const durCs = wt ? Math.max(4, Math.round((wt.endMs - wt.startMs) / 10)) : 20;
          return isRainbow ? `{\\kf${durCs}}${displayWord}` : displayWord;
        })
        .join(' ');
    });
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${assLines.join('\\N')}`;
  });

  return `${header}\n${events.join('\n')}\n`;
}
