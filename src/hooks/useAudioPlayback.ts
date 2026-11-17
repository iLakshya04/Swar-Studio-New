import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ActiveTrack } from '../components/AudioPlayerBar';
import {
  computeWebSpeechPitch,
  getAvailableWebSpeechVoices,
  isWebSpeechSupported,
  pickBestWebSpeechVoice,
} from '../utils/webSpeechFallback';

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
  const wsTimerRef = useRef<number | null>(null);
  const wsSessionRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);

  currentTimeRef.current = currentTime;

  const stopWebSpeechEngine = useCallback(() => {
    wsSessionRef.current += 1;
    if (wsTimerRef.current !== null) {
      window.clearInterval(wsTimerRef.current);
      wsTimerRef.current = null;
    }
    if (isWebSpeechSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancellation errors in restricted browsers
      }
    }
  }, []);

  const startWebSpeechFrom = useCallback(
    async (active: ActiveTrack, startSeconds: number, rate: number, vol: number, muted: boolean) => {
      stopWebSpeechEngine();
      const sessionId = wsSessionRef.current;
      const totalDur = Math.max(0.6, active.durationSec || 1);
      const clampedStart = Math.max(0, Math.min(startSeconds, Math.max(0, totalDur - 0.05)));
      setCurrentTime(clampedStart);
      setIsPlaying(true);

      // Build remaining script from wordTimings if seeking past start
      let textToSpeak = active.localSpeechScript || active.title;
      if (clampedStart > 0.1 && active.wordTimings?.length) {
        const remainingWords = active.wordTimings.filter((w) => w.endSeconds > clampedStart);
        if (remainingWords.length > 0) {
          textToSpeak = remainingWords.map((w) => w.word).join(' ');
        }
      }

      const startWall = performance.now();
      wsTimerRef.current = window.setInterval(() => {
        if (wsSessionRef.current !== sessionId) return;
        const elapsed = ((performance.now() - startWall) / 1000) * rate;
        const nextTime = Math.min(totalDur, clampedStart + elapsed);
        setCurrentTime(nextTime);
        if (nextTime >= totalDur) {
          if (wsTimerRef.current !== null) {
            window.clearInterval(wsTimerRef.current);
            wsTimerRef.current = null;
          }
          setIsPlaying(false);
        }
      }, 65);

      if (!isWebSpeechSupported() || !textToSpeak.trim()) {
        return;
      }

      try {
        const voices = await getAvailableWebSpeechVoices();
        if (wsSessionRef.current !== sessionId) return;

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const matched = pickBestWebSpeechVoice(voices, {
          voiceId: active.voiceId,
          voiceName: active.voiceName,
          language: active.language,
        });
        if (matched) {
          utterance.voice = matched;
          utterance.lang = matched.lang;
        } else {
          utterance.lang = active.language === 'hi' ? 'hi-IN' : 'en-US';
        }
        utterance.rate = Math.max(0.5, Math.min(2.0, rate));
        utterance.pitch = computeWebSpeechPitch(active.pitchRegister, active.clonePitchHz);
        utterance.volume = muted ? 0 : vol;

        utterance.onboundary = (event) => {
          if (wsSessionRef.current !== sessionId || !active.wordTimings?.length) return;
          if (typeof event.charIndex === 'number') {
            const spokenPrefix = textToSpeak.slice(0, event.charIndex).trim();
            const spokenWordIdx = spokenPrefix ? spokenPrefix.split(/\s+/).length : 0;
            const offsetIdx =
              clampedStart > 0.1
                ? active.wordTimings.findIndex((w) => w.endSeconds > clampedStart)
                : 0;
            const targetIdx = Math.min(
              active.wordTimings.length - 1,
              Math.max(0, (offsetIdx >= 0 ? offsetIdx : 0) + spokenWordIdx)
            );
            const wt = active.wordTimings[targetIdx];
            if (wt) {
              setCurrentTime((prev) => Math.max(prev, Math.min(totalDur, wt.startSeconds + 0.01)));
            }
          }
        };

        utterance.onend = () => {
          if (wsSessionRef.current !== sessionId) return;
          if (wsTimerRef.current !== null) {
            window.clearInterval(wsTimerRef.current);
            wsTimerRef.current = null;
          }
          setCurrentTime(totalDur);
          setIsPlaying(false);
        };

        utterance.onerror = () => {
          // Keep visual interval playback smooth if speechSynthesis throws in headless browser
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        // Keep simulated timer fallback running cleanly
      }
    },
    [stopWebSpeechEngine]
  );

  useEffect(() => {
    stopWebSpeechEngine();

    if (!track) {
      setAudioSrc(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    if (track.isLocalWebSpeech) {
      setAudioSrc(null);
      setCurrentTime(0);
      setDuration(track.durationSec || 1);
      void startWebSpeechFrom(track, 0, playbackRate, volume, isMuted);
      return () => {
        stopWebSpeechEngine();
      };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (track?.isLocalWebSpeech) {
      if (isPlaying) {
        stopWebSpeechEngine();
        setIsPlaying(false);
      } else {
        const startPos =
          currentTimeRef.current >= Math.max(0.2, (track.durationSec || duration) - 0.15)
            ? 0
            : currentTimeRef.current;
        void startWebSpeechFrom(track, startPos, playbackRate, volume, isMuted);
      }
      return;
    }

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
  }, [
    audioSrc,
    duration,
    isMuted,
    isPlaying,
    playbackRate,
    startWebSpeechFrom,
    stopWebSpeechEngine,
    track,
    volume,
  ]);

  const seekTo = useCallback(
    (seconds: number, autoPlay = false) => {
      if (track?.isLocalWebSpeech) {
        const maxDur = track.durationSec || duration || 1;
        const clamped = Math.max(0, Math.min(seconds, maxDur));
        setCurrentTime(clamped);
        if (isPlaying || autoPlay) {
          void startWebSpeechFrom(track, clamped, playbackRate, volume, isMuted);
        }
        return;
      }

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
    [audioSrc, duration, isMuted, isPlaying, playbackRate, startWebSpeechFrom, track, volume]
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
