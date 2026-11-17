import { useState } from 'react';
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
import type {
  ChannelCount,
  LanguageMode,
  PitchRegister,
  PrebuiltVoiceName,
  SampleRateHz,
  SubtitleFormat,
  SubtitleGranularity,
  TimingSource,
  WordTiming,
} from '../types';
import { formatAudioTime } from '../utils/speechLogic';
import { generate_subtitles } from '../utils/subtitleGenerator';
import { WaveformCanvas } from './WaveformCanvas';

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
  timingSource?: TimingSource;
  timingConfidence?: number;
  wordTimings?: WordTiming[];
  waveformPeaks?: number[];
  isLocalWebSpeech?: boolean;
  localSpeechScript?: string;
  voiceId?: string;
  voiceName?: PrebuiltVoiceName;
  language?: LanguageMode;
  pitchRegister?: PitchRegister;
  clonePitchHz?: number;
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

  const activeWord = track?.wordTimings?.find((w) => {
    const curMs = currentTime * 1000;
    return curMs >= w.startMs - (isPlaying ? 30 : 0) && curMs <= w.endMs + (isPlaying ? 50 : 0);
  });

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

  const handleDownloadSubtitles = (
    format: SubtitleFormat,
    granularity: SubtitleGranularity = 'phrase'
  ) => {
    if (!track?.wordTimings?.length) return;
    const safeName =
      track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) ||
      'svara-captions';
    const subContent = generate_subtitles({
      wordTimings: track.wordTimings,
      format,
      granularity,
      preset: 'rainbow_reels',
    });
    const blob = new Blob([subContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}${granularity === 'word' ? '-words' : ''}.${format}`;
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
    ? track.isLocalWebSpeech
      ? 'Browser OS Voice · Offline Mode'
      : `${track.sampleRate ? `${(track.sampleRate / 1000).toFixed(track.sampleRate === 44100 ? 1 : 0)} kHz` : '48 kHz'} · ${track.channels === 2 ? 'Stereo' : 'Mono'} WAV`
    : '48 kHz studio WAV';

  const effectiveDur = duration > 0 ? duration : track?.durationSec || 1;

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
              {isGenerating ? (
                'Generating mastered studio WAV'
              ) : activeWord ? (
                <span
                  data-testid="player-active-word"
                  className="text-[#0EA5E9] dark:text-cyan-400 font-medium"
                >
                  Speaking: “{activeWord.word}” · {formatMeta}
                </span>
              ) : track ? (
                `${track.subtitle} · ${formatMeta}`
              ) : (
                'Write or load a script and press Generate Speech'
              )}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 flex-1 min-w-[180px] max-w-md">
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 w-9 text-right shrink-0">
            {formatAudioTime(currentTime)}
          </span>
          <div className="flex-1">
            <WaveformCanvas
              testId="player-waveform-canvas"
              ariaLabel="Audio playback position"
              compact
              height={28}
              barCount={44}
              waveformPeaks={track?.waveformPeaks}
              wordTimings={track?.wordTimings}
              durationSec={effectiveDur}
              currentTime={currentTime}
              isPlaying={isPlaying}
              hasAudio={Boolean(track)}
              isDark={isDark}
              onSeek={seekTo}
              onTogglePlay={togglePlay}
            />
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 w-9 shrink-0">
            {formatAudioTime(duration || track?.durationSec || 0)}
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
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadSubtitles('srt', 'phrase')}
                aria-label="Download SRT subtitles"
                className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Captions className="w-3.5 h-3.5" />
                <span>.SRT</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSubtitles('srt', 'word')}
                data-testid="player-download-word-srt"
                aria-label="Download word-level SRT subtitles"
                className="inline-flex items-center px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Word .SRT</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSubtitles('vtt', 'phrase')}
                aria-label="Download VTT subtitles"
                className="inline-flex items-center px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <span>.VTT</span>
              </button>
            </div>
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
            disabled={!track || Boolean(track.isLocalWebSpeech)}
            title={
              track?.isLocalWebSpeech
                ? 'Browser OS Web Speech plays directly through speakers; switch to Cloud/Keyless to export WAV.'
                : 'Download mastered WAV audio'
            }
            data-testid="player-download-wav"
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#0F172A] dark:bg-[#2563EB] text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:border-slate-200 dark:disabled:border-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{track?.isLocalWebSpeech ? 'Local Voice Only' : 'Download WAV'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
