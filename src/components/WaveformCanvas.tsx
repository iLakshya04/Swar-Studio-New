import { useEffect, useMemo, useRef, useState } from 'react';
import type { WordTiming } from '../types';
import { buildFallbackWaveformPeaks } from '../utils/generateClient';

export interface WaveformCanvasProps {
  waveformPeaks?: number[];
  wordTimings?: WordTiming[];
  durationSec: number;
  currentTime: number;
  isPlaying: boolean;
  hasAudio: boolean;
  isDark?: boolean;
  height?: number;
  barCount?: number;
  compact?: boolean;
  highlightedWordIndex?: number | null;
  onSeek?: (seconds: number, autoPlay?: boolean) => void;
  onHoverWordChange?: (wordIndex: number | null, hoverTimeSec: number | null) => void;
  onTogglePlay?: () => void;
  testId?: string;
  ariaLabel?: string;
  className?: string;
}

function findWordIndexAtTime(
  wordTimings: WordTiming[],
  timeSec: number,
  allowEdgeTolerance: boolean
): number {
  if (!wordTimings.length || !Number.isFinite(timeSec)) return -1;
  const timeMs = timeSec * 1000;
  const exact = wordTimings.findIndex((w) => timeMs >= w.startMs && timeMs <= w.endMs);
  if (exact !== -1) return exact;
  if (allowEdgeTolerance && timeMs > 0) {
    return wordTimings.findIndex((w) => timeMs >= w.startMs - 35 && timeMs <= w.endMs + 55);
  }
  return -1;
}

export function WaveformCanvas({
  waveformPeaks,
  wordTimings = [],
  durationSec,
  currentTime,
  isPlaying,
  hasAudio,
  isDark = false,
  height = 88,
  barCount,
  compact = false,
  highlightedWordIndex = null,
  onSeek,
  onHoverWordChange,
  onTogglePlay,
  testId = 'waveform-canvas',
  ariaLabel = 'Interactive speech waveform',
  className = '',
}: WaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(compact ? 260 : 640);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [pointerHoverTime, setPointerHoverTime] = useState<number | null>(null);

  const effectiveDuration = useMemo(() => {
    if (durationSec > 0) return durationSec;
    if (wordTimings.length > 0) {
      const last = wordTimings[wordTimings.length - 1];
      return Math.max(0.2, last.endMs / 1000 || last.endSeconds || 1);
    }
    return 1;
  }, [durationSec, wordTimings]);

  const bars = useMemo(() => {
    const raw =
      Array.isArray(waveformPeaks) && waveformPeaks.length > 0
        ? waveformPeaks
        : buildFallbackWaveformPeaks(wordTimings, effectiveDuration, barCount ?? (compact ? 44 : 110));

    if (!barCount || raw.length === barCount) return raw;
    return Array.from({ length: barCount }, (_, idx) => {
      const srcIdx = Math.min(raw.length - 1, Math.floor((idx / barCount) * raw.length));
      return raw[srcIdx];
    });
  }, [waveformPeaks, wordTimings, effectiveDuration, barCount, compact]);

  const activeWordIndex = useMemo(
    () => findWordIndexAtTime(wordTimings, currentTime, isPlaying),
    [wordTimings, currentTime, isPlaying]
  );

  const pointerWordIndex = useMemo(() => {
    if (pointerHoverTime === null) return -1;
    return findWordIndexAtTime(wordTimings, pointerHoverTime, false);
  }, [wordTimings, pointerHoverTime]);

  const inspectedWordIndex =
    highlightedWordIndex !== null && highlightedWordIndex >= 0
      ? highlightedWordIndex
      : pointerWordIndex >= 0
        ? pointerWordIndex
        : activeWordIndex;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const nextW = Math.max(120, Math.round(container.clientWidth));
      setCanvasWidth(nextW);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const targetW = Math.max(120, canvasWidth);
    const targetH = Math.max(24, height);

    if (canvas.width !== targetW * dpr || canvas.height !== targetH * dpr) {
      canvas.width = targetW * dpr;
      canvas.height = targetH * dpr;
    }

    const drawFrame = (nowMs: number) => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, targetW, targetH);

      const durationMs = Math.max(200, effectiveDuration * 1000);
      const progress = Math.min(1, Math.max(0, currentTime / effectiveDuration));
      const inspectedWord =
        inspectedWordIndex >= 0 && wordTimings[inspectedWordIndex]
          ? wordTimings[inspectedWordIndex]
          : null;

      const highlightStartRatio = inspectedWord ? Math.max(0, inspectedWord.startMs / durationMs) : -1;
      const highlightEndRatio = inspectedWord
        ? Math.min(1, Math.max(highlightStartRatio + 0.008, inspectedWord.endMs / durationMs))
        : -1;

      // Translucent highlight band for the currently spoken or hovered word
      if (inspectedWord && hasAudio) {
        const bandX = highlightStartRatio * targetW;
        const bandW = Math.max(4, (highlightEndRatio - highlightStartRatio) * targetW);
        ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(14, 165, 233, 0.12)';
        ctx.fillRect(bandX, 0, bandW, targetH);
        if (!compact) {
          ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.42)' : 'rgba(14, 165, 233, 0.42)';
          ctx.fillRect(bandX, 0, 1, targetH);
          ctx.fillRect(bandX + bandW - 1, 0, 1, targetH);
        }
      }

      // Word boundary ticks along bottom edge in full mode
      if (!compact && wordTimings.length > 0 && wordTimings.length <= 160) {
        ctx.fillStyle = isDark ? '#334155' : '#CBD5E1';
        for (const w of wordTimings) {
          const tickX = Math.round((w.startMs / durationMs) * targetW);
          ctx.fillRect(tickX, targetH - 6, 1, 6);
        }
      }

      // Draw amplitude bars
      const count = bars.length;
      const gap = compact ? 2 : targetW / count > 5 ? 2 : 1;
      const barWidth = Math.max(1.5, (targetW - gap * (count - 1)) / count);
      const verticalPad = compact ? 4 : 14;
      const maxBarH = Math.max(8, targetH - verticalPad);

      for (let i = 0; i < count; i += 1) {
        const ratio = (i + 0.5) / count;
        const basePeak = Math.max(0.06, Math.min(1, bars[i] ?? 0.2));
        const motionOffset =
          compact && isPlaying ? 0.08 * Math.sin(nowMs * 0.009 + i * 0.55) : 0;
        const amp = Math.max(0.08, Math.min(1, basePeak + motionOffset));
        const barH = Math.max(3, Math.round(amp * maxBarH));
        const x = i * (barWidth + gap);
        const y = Math.round((targetH - barH) / 2);

        const inHighlightedWord =
          inspectedWord !== null &&
          ratio >= highlightStartRatio &&
          ratio <= highlightEndRatio;

        if (!hasAudio) {
          ctx.fillStyle = isDark ? '#1E293B' : '#E2E8F0';
        } else if (inHighlightedWord) {
          ctx.fillStyle = isDark ? '#38BDF8' : '#0EA5E9';
        } else if (ratio <= progress) {
          ctx.fillStyle = isDark ? '#3B82F6' : '#2563EB';
        } else {
          ctx.fillStyle = isDark ? '#334155' : '#CBD5E1';
        }

        const r = Math.min(2, barWidth / 2);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, r);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, barH);
        }
      }

      // Crisp playhead cursor
      if (!compact && hasAudio) {
        const playX = Math.min(targetW - 2, Math.max(1, progress * targetW));
        ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
        ctx.fillRect(playX - 1, 0, 2, targetH);
        ctx.fillRect(playX - 4, 0, 8, 6);
      }

      ctx.restore();

      if (compact && isPlaying) {
        rafRef.current = requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(performance.now());
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [
    bars,
    canvasWidth,
    compact,
    currentTime,
    effectiveDuration,
    hasAudio,
    height,
    inspectedWordIndex,
    isDark,
    isPlaying,
    wordTimings,
  ]);

  const resolveRatioFromClientX = (clientX: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handlePointerPosition = (clientX: number, shouldSeek: boolean) => {
    const ratio = resolveRatioFromClientX(clientX);
    const timeSec = ratio * effectiveDuration;
    setPointerHoverTime(timeSec);
    const idx = findWordIndexAtTime(wordTimings, timeSec, false);
    onHoverWordChange?.(idx >= 0 ? idx : null, timeSec);
    if (shouldSeek && hasAudio) {
      onSeek?.(timeSec, false);
    }
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={hasAudio ? 0 : -1}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Number(effectiveDuration.toFixed(2))}
      aria-valuenow={Number(currentTime.toFixed(2))}
      data-testid={testId}
      data-active-word-index={activeWordIndex}
      data-inspected-word-index={inspectedWordIndex}
      style={{ height: `${height}px` }}
      onPointerDown={(e) => {
        if (!hasAudio) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsScrubbing(true);
        handlePointerPosition(e.clientX, true);
      }}
      onPointerMove={(e) => {
        handlePointerPosition(e.clientX, isScrubbing);
      }}
      onPointerUp={() => setIsScrubbing(false)}
      onPointerCancel={() => setIsScrubbing(false)}
      onPointerLeave={() => {
        setIsScrubbing(false);
        setPointerHoverTime(null);
        onHoverWordChange?.(null, null);
      }}
      onKeyDown={(e) => {
        if (!hasAudio) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onSeek?.(Math.min(effectiveDuration, currentTime + 0.25), false);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onSeek?.(Math.max(0, currentTime - 0.25), false);
        } else if (e.key === ' ') {
          e.preventDefault();
          onTogglePlay?.();
        }
      }}
      className={`relative w-full select-none overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
        hasAudio ? 'cursor-pointer' : 'cursor-default'
      } ${
        compact
          ? 'rounded-md'
          : 'rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
      } ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
