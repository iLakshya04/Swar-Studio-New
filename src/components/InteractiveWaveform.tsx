import { useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { TimingSource, WordTiming } from '../types';
import { WaveformCanvas } from './WaveformCanvas';

interface InteractiveWaveformProps {
  title?: string;
  wordTimings?: WordTiming[];
  waveformPeaks?: number[];
  timingSource?: TimingSource;
  timingConfidence?: number;
  durationSec: number;
  currentTime: number;
  isPlaying: boolean;
  hasAudio: boolean;
  isDark?: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number, autoPlay?: boolean) => void;
}

function formatPreciseSec(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00s';
  return `${seconds.toFixed(2)}s`;
}

export function InteractiveWaveform({
  title,
  wordTimings = [],
  waveformPeaks,
  timingSource,
  timingConfidence,
  durationSec,
  currentTime,
  isPlaying,
  hasAudio,
  isDark = false,
  onTogglePlay,
  onSeek,
}: InteractiveWaveformProps) {
  const [hoveredWordIdx, setHoveredWordIdx] = useState<number | null>(null);
  const [canvasHoverWordIdx, setCanvasHoverWordIdx] = useState<number | null>(null);

  const effectiveDuration = useMemo(() => {
    if (durationSec > 0) return durationSec;
    if (wordTimings.length > 0) {
      const last = wordTimings[wordTimings.length - 1];
      return Math.max(0.2, last.endMs / 1000 || last.endSeconds || 1);
    }
    return 1;
  }, [durationSec, wordTimings]);

  const activeWordIndex = useMemo(() => {
    if (wordTimings.length === 0) return -1;
    const currentMs = currentTime * 1000;
    const direct = wordTimings.findIndex((w) => currentMs >= w.startMs && currentMs <= w.endMs);
    if (direct !== -1) return direct;
    if (isPlaying && currentTime > 0) {
      return wordTimings.findIndex((w) => currentMs >= w.startMs - 40 && currentMs <= w.endMs + 60);
    }
    return -1;
  }, [wordTimings, currentTime, isPlaying]);

  const resolvedHoverIdx =
    hoveredWordIdx !== null ? hoveredWordIdx : canvasHoverWordIdx;

  const hoveredWord =
    resolvedHoverIdx !== null && wordTimings[resolvedHoverIdx]
      ? wordTimings[resolvedHoverIdx]
      : null;

  const activeWord = activeWordIndex >= 0 ? wordTimings[activeWordIndex] : null;
  const inspectedWord = hoveredWord ?? activeWord;

  return (
    <section
      aria-label="Interactive speech waveform and word-level offsets"
      data-testid="interactive-waveform-panel"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
    >
      {/* Waveform Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!hasAudio}
            aria-label={isPlaying ? 'Pause waveform playback' : 'Play waveform playback'}
            data-testid="waveform-play-toggle"
            className="w-10 h-10 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white flex items-center justify-center shrink-0 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100 truncate">
              {title ? `Interactive Waveform · ${title}` : 'Interactive Waveform & Word Timings'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
              {wordTimings.length} words ·{' '}
              {timingSource === 'provider'
                ? 'Provider timestamps'
                : timingSource === 'estimated'
                  ? 'Estimated pacing'
                  : 'Forced-aligned'}
              {typeof timingConfidence === 'number'
                ? ` (${Math.round(timingConfidence * 100)}%)`
                : ''}{' '}
              · Click waveform or word to jump
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {inspectedWord ? (
            <div
              data-testid="waveform-offset-readout"
              className="text-xs font-mono tabular-nums text-[#2563EB] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-900 px-2.5 py-1 rounded-md whitespace-nowrap"
            >
              “{inspectedWord.word}” · {inspectedWord.startMs}ms – {inspectedWord.endMs}ms
            </div>
          ) : (
            <div
              data-testid="waveform-offset-readout"
              className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Hover word for offset
            </div>
          )}

          <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
            {formatPreciseSec(currentTime)} / {formatPreciseSec(effectiveDuration)}
          </div>
        </div>
      </div>

      {/* Reusable HiDPI WaveformCanvas */}
      <WaveformCanvas
        testId="interactive-waveform-canvas"
        ariaLabel="Interactive speech waveform scrubber"
        waveformPeaks={waveformPeaks}
        wordTimings={wordTimings}
        durationSec={effectiveDuration}
        currentTime={currentTime}
        isPlaying={isPlaying}
        hasAudio={hasAudio}
        isDark={isDark}
        height={92}
        highlightedWordIndex={hoveredWordIdx}
        onTogglePlay={onTogglePlay}
        onSeek={onSeek}
        onHoverWordChange={(wordIndex) => setCanvasHoverWordIdx(wordIndex)}
      />

      {/* Synchronized Word-Timing Offset Strip */}
      {wordTimings.length > 0 && (
        <div
          data-testid="waveform-word-strip"
          className="max-h-40 overflow-y-auto pt-1 flex flex-wrap gap-1.5"
        >
          {wordTimings.map((w, idx) => {
            const isActive = idx === activeWordIndex;
            const isHovered = idx === resolvedHoverIdx;
            return (
              <button
                key={`${w.word}-${w.startMs}-${idx}`}
                type="button"
                data-testid="waveform-word-token"
                data-word-index={idx}
                data-active={isActive ? 'true' : 'false'}
                title={`${w.word}: ${w.startMs}ms – ${w.endMs}ms (${w.endMs - w.startMs}ms)`}
                onMouseEnter={() => setHoveredWordIdx(idx)}
                onMouseLeave={() => setHoveredWordIdx((cur) => (cur === idx ? null : cur))}
                onFocus={() => setHoveredWordIdx(idx)}
                onBlur={() => setHoveredWordIdx((cur) => (cur === idx ? null : cur))}
                onClick={() => onSeek(w.startMs / 1000, true)}
                className={`inline-flex items-baseline gap-1.5 px-2 py-1 rounded-md border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  isActive
                    ? 'bg-[#2563EB] border-[#2563EB] text-white font-medium'
                    : isHovered
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-[#2563EB]/60 text-[#0F172A] dark:text-white'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-[#0F172A] dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span>{w.word}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums ${
                    isActive ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {(w.startMs / 1000).toFixed(2)}s
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
