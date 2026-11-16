import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  Check,
  Download,
  Link2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AudioPlaybackController } from '../hooks/useAudioPlayback';
import type { ChannelCount, SampleRateHz, SubtitleFormat, WordTiming } from '../types';
import { formatAudioTime } from '../utils/speechLogic';
import { generateSubtitles } from '../utils/subtitleGenerator';

export interface ActiveTrack {
  id: string;
  clipId?: string;
  title: string;
  subtitle: string;
  audioBase64: string;
  audioUrl?: string;
  downloadUrl?: string;
  durationSec: number;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  wordTimings?: WordTiming[];
  waveformPeaks?: number[];
}

interface AudioPlayerBarProps {
  track: ActiveTrack | null;
  playback: AudioPlaybackController;
  isGenerating: boolean;
  isDark?: boolean;
}

export function AudioPlayerBar({
  track,
  playback,
  isGenerating,
  isDark = false,
}: AudioPlayerBarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const {
    audioRef,
    audioSrc,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    togglePlay,
    seekTo,
    cycleSpeed,
    setVolume,
    toggleMute,
    audioHandlers,
  } = playback;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barCount = 44;
    const realPeaks = track?.waveformPeaks;

    const draw = (timeMs: number) => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
      const barWidth = Math.max(2, Math.floor((width - (barCount - 1) * 2) / barCount));

      for (let i = 0; i < barCount; i += 1) {
        const ratio = i / barCount;
        let baseEnvelope: number;
        if (realPeaks && realPeaks.length > 0) {
          const peakIdx = Math.min(
            realPeaks.length - 1,
            Math.floor((i / barCount) * realPeaks.length)
          );
          baseEnvelope = 0.2 + 0.78 * realPeaks[peakIdx];
        } else {
          baseEnvelope = 0.35 + 0.5 * Math.sin(i * 0.65 + 0.8) ** 2;
        }
        const motionOffset = isPlaying
          ? 0.12 * Math.sin(timeMs * 0.008 + i * 0.55)
          : 0;
        const barH = Math.max(
          4,
          Math.min(height - 4, Math.round((baseEnvelope + motionOffset) * (height - 6)))
        );
        const x = i * (barWidth + 2);
        const y = Math.round((height - barH) / 2);

        if (!track) {
          ctx.fillStyle = isDark ? '#1E293B' : '#E2E8F0';
        } else if (ratio <= progress) {
          ctx.fillStyle = '#2563EB';
        } else {
          ctx.fillStyle = isDark ? '#334155' : '#CBD5E1';
        }
        ctx.fillRect(x, y, barWidth, barH);
      }

      if (isPlaying) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    draw(performance.now());
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, currentTime, duration, track, isDark]);

  const handleDownloadWav = () => {
    if (!track) return;
    const safeName =
      track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) ||
      'svara-speech';
    const anchor = document.createElement('a');
    if (track.clipId) {
      anchor.href = `/api/clips/${track.clipId}.wav?download=1`;
    } else if (audioSrc) {
      anchor.href = audioSrc;
    } else {
      return;
    }
    anchor.download = `${safeName}.wav`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDownloadSubtitles = (format: SubtitleFormat) => {
    if (!track?.wordTimings?.length) return;
    const safeName =
      track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) ||
      'svara-captions';
    const subContent = generateSubtitles({
      wordTimings: track.wordTimings,
      format,
      preset: 'rainbow_reels',
    });
    const blob = new Blob([subContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleCopyShareLink = async () => {
    if (!track?.audioUrl) return;
    try {
      const fullUrl = `${window.location.origin}${track.audioUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const formatMeta = track
    ? `${track.sampleRate ? `${(track.sampleRate / 1000).toFixed(track.sampleRate === 44100 ? 1 : 0)} kHz` : '48 kHz'} · ${track.channels === 2 ? 'Stereo' : 'Mono'} WAV`
    : '48 kHz studio WAV';

  return (
    <div
      className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 lg:px-6 py-2.5 shrink-0"
      data-testid="audio-player-bar"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={audioHandlers.onTimeUpdate}
        onLoadedMetadata={audioHandlers.onLoadedMetadata}
        onEnded={audioHandlers.onEnded}
        onPlay={audioHandlers.onPlay}
        onPause={audioHandlers.onPause}
      />

      <div className="max-w-7xl mx-auto flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 lg:max-w-xs">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!track || isGenerating}
            aria-label={isPlaying ? 'Pause generated audio' : 'Play generated audio'}
            className="w-9 h-9 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white flex items-center justify-center shrink-0 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <div className="min-w-0">
            <p className="text-sm font-medium text-[#0F172A] dark:text-slate-100 truncate">
              {isGenerating
                ? 'Synthesizing speech...'
                : track
                  ? track.title
                  : 'Ready to synthesize'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              {isGenerating
                ? 'Generating mastered studio WAV'
                : track
                  ? `${track.subtitle} · ${formatMeta}`
                  : 'Write or load a script and press Generate Speech'}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 flex-1 min-w-[180px] max-w-md">
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 w-9 text-right shrink-0">
            {formatAudioTime(currentTime)}
          </span>
          <div className="relative flex-1 flex items-center">
            <canvas
              ref={canvasRef}
              width={260}
              height={28}
              className="w-full h-7 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="range"
              aria-label="Audio playback position"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.05}
              value={Math.min(currentTime, duration > 0 ? duration : 1)}
              disabled={!track}
              onChange={(e) => seekTo(Number(e.target.value), false)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
            />
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 w-9 shrink-0">
            {formatAudioTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${playbackRate}x`}
            className="px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {playbackRate}x
          </button>

          <div className="hidden xl:flex items-center gap-1.5 px-1">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              aria-label="Audio volume"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-16 accent-[#2563EB] cursor-pointer"
            />
          </div>

          {track?.wordTimings && track.wordTimings.length > 0 && (
            <button
              type="button"
              onClick={() => handleDownloadSubtitles('srt')}
              aria-label="Download SRT subtitles"
              className="hidden md:inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Captions className="w-3.5 h-3.5" />
              <span>.SRT</span>
            </button>
          )}

          {track?.audioUrl && (
            <button
              type="button"
              onClick={handleCopyShareLink}
              aria-label="Copy audio clip URL"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Copy URL</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadWav}
            disabled={!track}
            data-testid="player-download-wav"
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#0F172A] dark:bg-[#2563EB] text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:border-slate-200 dark:disabled:border-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download WAV</span>
          </button>
        </div>
      </div>
    </div>
  );
}
