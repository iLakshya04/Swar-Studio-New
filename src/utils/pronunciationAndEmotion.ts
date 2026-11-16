import type { LanguageMode, PronunciationEntry } from '../types';

export interface ParsedScriptSegment {
  index: number;
  emotion?: string;
  emotionPrompt?: string;
  displayText: string;
  rawText: string;
}

const EMOTION_STYLE_MAP: Record<string, string> = {
  CURIOUS: 'inquisitive, curious upward inflection, engaged wonder',
  CHALLENGING: 'pointed, challenging emphasis with crisp contrast',
  AWE: 'awed, reverent sense of scale and quiet amazement',
  QUIET: 'intimate, lowered voice, soft and reflective',
  EXCITED: 'energetic, enthusiastic momentum',
  SERIOUS: 'grave, serious, focused authority',
  WARM: 'warm, reassuring, friendly proximity',
  DRAMATIC: 'cinematic dramatic tension and deliberate weight',
  FAST: 'brisk, urgent forward pacing',
  SLOW: 'deliberate, unhurried pacing',
};

const BRACKET_TAG_RE = /\[([A-Z_]{2,24})\]/g;

export function stripInlinePerformanceTags(text: string): string {
  return text
    .replace(BRACKET_TAG_RE, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\|[^|]+\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getEmotionStyleHint(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const upper = tag.trim().toUpperCase().replace(/[^A-Z_]/g, '');
  if (!upper) return undefined;
  return EMOTION_STYLE_MAP[upper] || `${upper.toLowerCase().replace(/_/g, ' ')} delivery`;
}

/**
 * Splits a script into ordered narration segments, preserving per-line or per-sentence
 * bracketed emotion directives like [CURIOUS], [CHALLENGING], [AWE], [QUIET].
 */
export function splitScriptIntoSegments(script: string): ParsedScriptSegment[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const rawBlocks = normalized
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const segments: ParsedScriptSegment[] = [];
  let currentEmotion: string | undefined;
  let pendingInlinePrefix = '';

  for (const block of rawBlocks) {
    // Split on sentence boundaries (. ! ? ।) when followed by whitespace and more text,
    // or when a new [TAG] starts mid-line.
    const subParts = block
      .split(/(?=(?:\[[A-Z_]{2,24}\]))|(?<=[.!?।])\s+(?=[A-Z0-9\u0900-\u097F"<|\[])/u)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const part of subParts) {
      let working = part;
      const tagMatches = Array.from(working.matchAll(BRACKET_TAG_RE));
      if (tagMatches.length > 0) {
        currentEmotion = tagMatches[tagMatches.length - 1][1];
        working = working.replace(BRACKET_TAG_RE, '').replace(/\s+/g, ' ').trim();
      }
      if (!working) continue;

      const displayText = working
        .replace(/<[^>]+>/g, ' ')
        .replace(/\|[^|]+\|/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!displayText) {
        // Inline-only performance tag (e.g. "<breath>") — attach to adjacent spoken segment
        pendingInlinePrefix = pendingInlinePrefix ? `${pendingInlinePrefix} ${working}` : working;
        continue;
      }

      const rawText = pendingInlinePrefix ? `${pendingInlinePrefix} ${working}` : working;
      pendingInlinePrefix = '';

      segments.push({
        index: segments.length,
        emotion: currentEmotion,
        emotionPrompt: getEmotionStyleHint(currentEmotion),
        displayText,
        rawText,
      });
    }
  }

  if (pendingInlinePrefix && segments.length > 0) {
    const last = segments[segments.length - 1];
    last.rawText = `${last.rawText} ${pendingInlinePrefix}`.trim();
  }

  return segments;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsDevanagari(str: string): boolean {
  return /[\u0900-\u097F]/.test(str);
}

/**
 * Applies user-defined pronunciation guide rules to a TTS script while leaving
 * the display/caption script untouched. Returns the spoken TTS text, prompt hints
 * for Gemini speechMetadata, and a list of matched terms.
 */
export function applyPronunciationRules(
  text: string,
  rules: PronunciationEntry[],
  targetLanguage: LanguageMode
): {
  ttsText: string;
  pronunciationPrompt: string;
  appliedTerms: string[];
} {
  if (!text.trim() || !rules.length) {
    return { ttsText: text, pronunciationPrompt: '', appliedTerms: [] };
  }

  const activeRules = rules.filter(
    (r) =>
      r.enabled &&
      r.term.trim().length > 0 &&
      r.phonetic.trim().length > 0 &&
      (targetLanguage === 'bilingual' ||
        r.language === 'bilingual' ||
        r.language === targetLanguage)
  );

  let ttsText = text;
  const appliedTerms: string[] = [];
  const promptHints: string[] = [];

  for (const rule of activeRules) {
    const term = rule.term.trim();
    const phonetic = rule.phonetic.trim();
    const escaped = escapeRegExp(term);

    const matcher = containsDevanagari(term)
      ? new RegExp(escaped, 'g')
      : new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi');

    if (matcher.test(ttsText)) {
      appliedTerms.push(term);
      const ipaPart = rule.ipa?.trim() ? ` (IPA: ${rule.ipa.trim()})` : '';
      promptHints.push(`"${term}" pronounced "${phonetic}"${ipaPart}`);
      // For tricky alphanumeric tokens (e.g. R4agRek0il) or explicit respellings without IPA-only notation,
      // lightly substitute when phonetic is written as speakable syllables/words.
      if (!/[\/\[\]]/.test(phonetic)) {
        ttsText = ttsText.replace(matcher, phonetic);
      }
    }
  }

  const pronunciationPrompt =
    promptHints.length > 0 ? `Pronunciation guide: ${promptHints.join('; ')}` : '';

  return {
    ttsText,
    pronunciationPrompt,
    appliedTerms,
  };
}
