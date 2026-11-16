import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ActiveTrack } from '../components/AudioPlayerBar';

const SPEED_OPTIONS = [0.85, 1.0, 1.25, 1.5];

export interface AudioPlaybackController {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioSrc: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  togglePlay: () => void;
  seekTo: (seconds: number, autoPlay?: boolean) => void;
  cycleSpeed: () => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  audioHandlers: {
    onTimeUpdate: (e: SyntheticEvent<HTMLAudioElement>) => void;
    onLoadedMetadata: (e: SyntheticEvent<HTMLAudioElement>) => void;
    onEnded: () => void;
    onPlay: () => void;
    onPause: () => void;
  };
}

export function useAudioPlayback(
  track: ActiveTrack | null,
  onPlaybackError?: (msg: string) => void
): AudioPlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!track) {
      setAudioSrc(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (track.audioBase64) {
      try {
        const binary = atob(track.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setAudioSrc(url);
        setCurrentTime(0);
        setDuration(track.durationSec || 0);

        return () => {
          URL.revokeObjectURL(url);
        };
      } catch {
        onPlaybackError?.('Unable to decode generated WAV audio.');
        return undefined;
      }
    }

    if (track.audioUrl) {
      setAudioSrc(track.audioUrl);
      setCurrentTime(0);
      setDuration(track.durationSec || 0);
      return undefined;
    }

    setAudioSrc(null);
    return undefined;
  }, [track, onPlaybackError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) {
      return;
    }
    audio.src = audioSrc;
    audio.playbackRate = playbackRate;
    audio.volume = isMuted ? 0 : volume;
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [audioSrc, isPlaying]);

  const seekTo = useCallback(
    (seconds: number, autoPlay = false) => {
      const audio = audioRef.current;
      if (!audio || !audioSrc) return;
      const maxDur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : duration > 0
            ? duration
            : Math.max(0, seconds);
      const clamped = Math.max(0, Math.min(seconds, maxDur));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
      if (autoPlay && audio.paused) {
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    },
    [audioSrc, duration]
  );

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleSetVolume = useCallback((nextVol: number) => {
    setIsMuted(false);
    setVolume(Math.max(0, Math.min(1, nextVol)));
  }, []);

  return {
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
    setPlaybackRate,
    setVolume: handleSetVolume,
    toggleMute,
    audioHandlers: {
      onTimeUpdate: (e) => setCurrentTime(e.currentTarget.currentTime),
      onLoadedMetadata: (e) => {
        const d = e.currentTarget.duration;
        if (Number.isFinite(d) && d > 0) {
          setDuration(d);
        }
      },
      onEnded: () => setIsPlaying(false),
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
    },
  };
}
