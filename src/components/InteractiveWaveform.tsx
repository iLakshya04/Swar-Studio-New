import { useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { TimingSource, WordTiming } from '../types';
import { buildFallbackWaveformPeaks } from '../utils/generateClient';

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
  onTogglePlay,
  onSeek,
}: InteractiveWaveformProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoveredWordIdx, setHoveredWordIdx] = useState<number | null>(null);
  const [hoverTimeSec, setHoverTimeSec] = useState<number | null>(null);

  const effectiveDuration = useMemo(() => {
    if (durationSec > 0) return durationSec;
    if (wordTimings.length > 0) {
      return wordTimings[wordTimings.length - 1].endSeconds;
    }
    return 1;
  }, [durationSec, wordTimings]);

  const bars = useMemo(() => {
    if (Array.isArray(waveformPeaks) && waveformPeaks.length > 0) {
      return waveformPeaks;
    }
    return buildFallbackWaveformPeaks(wordTimings, effectiveDuration, 110);
  }, [waveformPeaks, wordTimings, effectiveDuration]);

  const activeWordIndex = useMemo(() => {
    if (wordTimings.length === 0) return -1;
    // Direct match first
    const direct = wordTimings.findIndex(
      (w) => currentTime >= w.startSeconds && currentTime <= w.endSeconds
    );
    if (direct !== -1) return direct;
    // Near edge tolerance while playing
    if (isPlaying && currentTime > 0) {
      return wordTimings.findIndex(
        (w) => currentTime >= w.startSeconds - 0.04 && currentTime <= w.endSeconds + 0.06
      );
    }
    return -1;
  }, [wordTimings, currentTime, isPlaying]);

  const hoveredWord =
    hoveredWordIdx !== null && wordTimings[hoveredWordIdx]
      ? wordTimings[hoveredWordIdx]
      : hoverTimeSec !== null
        ? wordTimings.find(
            (w) => hoverTimeSec >= w.startSeconds && hoverTimeSec <= w.endSeconds
          ) ?? null
        : null;

  const activeWord = activeWordIndex >= 0 ? wordTimings[activeWordIndex] : null;
  const inspectedWord = hoveredWord ?? activeWord;

  const progressPct = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  const seekFromClientX = (clientX: number, autoPlay = false) => {
    const el = trackRef.current;
    if (!el || !hasAudio) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextSec = ratio * effectiveDuration;
    setHoverTimeSec(nextSec);
    onSeek(nextSec, autoPlay);
  };

  const highlightStartPct = inspectedWord
    ? Math.max(0, (inspectedWord.startSeconds / effectiveDuration) * 100)
    : null;
  const highlightWidthPct = inspectedWord
    ? Math.max(
        0.6,
        ((inspectedWord.endSeconds - inspectedWord.startSeconds) / effectiveDuration) * 100
      )
    : null;

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
              “{inspectedWord.word}” · {formatPreciseSec(inspectedWord.startSeconds)} –{' '}
              {formatPreciseSec(inspectedWord.endSeconds)}
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

      {/* Interactive Scrubbable Waveform */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={hasAudio ? 0 : -1}
        aria-label="Interactive speech waveform scrubber"
        aria-valuemin={0}
        aria-valuemax={Number(effectiveDuration.toFixed(2))}
        aria-valuenow={Number(currentTime.toFixed(2))}
        data-testid="interactive-waveform-canvas"
        onPointerDown={(e) => {
          if (!hasAudio) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setIsScrubbing(true);
          seekFromClientX(e.clientX, false);
        }}
        onPointerMove={(e) => {
          const el = trackRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          if (rect.width > 0) {
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverTimeSec(ratio * effectiveDuration);
          }
          if (isScrubbing) {
            seekFromClientX(e.clientX, false);
          }
        }}
        onPointerUp={() => setIsScrubbing(false)}
        onPointerCancel={() => setIsScrubbing(false)}
        onPointerLeave={() => {
          setIsScrubbing(false);
          setHoverTimeSec(null);
        }}
        onKeyDown={(e) => {
          if (!hasAudio) return;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onSeek(Math.min(effectiveDuration, currentTime + 0.25), false);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onSeek(Math.max(0, currentTime - 0.25), false);
          } else if (e.key === ' ') {
            e.preventDefault();
            onTogglePlay();
          }
        }}
        className="relative h-24 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 flex items-center select-none cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
      >
        {/* Inspected / Active word span highlight */}
        {highlightStartPct !== null && highlightWidthPct !== null && (
          <div
            aria-hidden="true"
            style={{ left: `${highlightStartPct}%`, width: `${highlightWidthPct}%` }}
            className="absolute inset-y-0 bg-[#2563EB]/12 dark:bg-blue-500/20 border-x border-[#2563EB]/40 pointer-events-none transition-all duration-75"
          />
        )}

        {/* Word boundary ticks */}
        {wordTimings.length > 0 && wordTimings.length <= 160 && (
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 pointer-events-none">
            {wordTimings.map((w, idx) => {
              const leftPct = (w.startSeconds / effectiveDuration) * 100;
              return (
                <span
                  key={`${w.word}-${idx}`}
                  style={{ left: `${leftPct}%` }}
                  className="absolute bottom-0 w-px h-1.5 bg-slate-300 dark:bg-slate-700"
                />
              );
            })}
          </div>
        )}

        {/* Amplitude Bars */}
        <div
          aria-hidden="true"
          className="relative z-10 w-full h-16 flex items-center justify-between gap-[2px] pointer-events-none"
        >
          {bars.map((peak, idx) => {
            const barCenterPct = ((idx + 0.5) / bars.length) * 100;
            const isPlayed = barCenterPct <= progressPct;
            const inHighlightedWord =
              highlightStartPct !== null &&
              highlightWidthPct !== null &&
              barCenterPct >= highlightStartPct &&
              barCenterPct <= highlightStartPct + highlightWidthPct;
            const heightPct = Math.max(8, Math.min(100, Math.round(peak * 100)));

            return (
              <div
                key={idx}
                style={{ height: `${heightPct}%` }}
                className={`flex-1 min-w-[2px] rounded-xs transition-colors duration-75 ${
                  inHighlightedWord
                    ? 'bg-[#0EA5E9] dark:bg-cyan-400'
                    : isPlayed
                      ? 'bg-[#2563EB] dark:bg-blue-500'
                      : 'bg-slate-300 dark:bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Playhead Cursor */}
        <div
          aria-hidden="true"
          style={{ left: `${Math.min(99.2, Math.max(0.5, progressPct))}%` }}
          className="absolute inset-y-0 w-0.5 bg-[#0F172A] dark:bg-white z-20 pointer-events-none"
        >
          <span className="absolute -top-0.5 -left-1 w-2.5 h-2.5 rounded-xs bg-[#0F172A] dark:bg-white" />
        </div>
      </div>

      {/* Synchronized Word-Timing Offset Strip */}
      {wordTimings.length > 0 && (
        <div
          data-testid="waveform-word-strip"
          className="max-h-40 overflow-y-auto pt-1 flex flex-wrap gap-1.5"
        >
          {wordTimings.map((w, idx) => {
            const isActive = idx === activeWordIndex;
            const isHovered = idx === hoveredWordIdx;
            return (
              <button
                key={`${w.word}-${w.startMs}-${idx}`}
                type="button"
                data-testid="waveform-word-token"
                data-word-index={idx}
                data-active={isActive ? 'true' : 'false'}
                title={`${w.word}: ${formatPreciseSec(w.startSeconds)} – ${formatPreciseSec(w.endSeconds)} (${w.endMs - w.startMs}ms)`}
                onMouseEnter={() => setHoveredWordIdx(idx)}
                onMouseLeave={() => setHoveredWordIdx((cur) => (cur === idx ? null : cur))}
                onFocus={() => setHoveredWordIdx(idx)}
                onBlur={() => setHoveredWordIdx((cur) => (cur === idx ? null : cur))}
                onClick={() => onSeek(w.startSeconds, true)}
                className={`inline-flex items-baseline gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
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
                    isActive
                      ? 'text-blue-100'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {w.startSeconds.toFixed(2)}s
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
