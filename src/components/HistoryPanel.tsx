import { useState } from 'react';
import { Captions, Download, Mic2, Play, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { AudioPlaybackController } from '../hooks/useAudioPlayback';
import type { HistoryItem, SubtitleFormat } from '../types';
import { formatAudioTime } from '../utils/speechLogic';
import { generate_subtitles } from '../utils/subtitleGenerator';
import { InteractiveWaveform } from './InteractiveWaveform';

interface HistoryPanelProps {
  items: HistoryItem[];
  activeTrackId: string | null;
  playback: AudioPlaybackController;
  onPlayItem: (item: HistoryItem) => void;
  onRestoreToStudio: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onGoToStudio: () => void;
}

export function HistoryPanel({
  items,
  activeTrackId,
  playback,
  onPlayItem,
  onRestoreToStudio,
  onDeleteItem,
  onClearAll,
  onGoToStudio,
}: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [maxLines, setMaxLines] = useState<1 | 2 | 3>(2);
  const [maxDurationSec, setMaxDurationSec] = useState<number>(2.6);

  const filtered = items.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.fullText.toLowerCase().includes(q) ||
      item.voiceLabel.toLowerCase().includes(q) ||
      item.language.toLowerCase().includes(q)
    );
  });

  const inspectedItem =
    items.find((i) => i.id === activeTrackId) ??
    filtered.find((i) => (i.wordTimings?.length ?? 0) > 0 || (i.waveformPeaks?.length ?? 0) > 0) ??
    null;

  const isInspectedActive = Boolean(inspectedItem && inspectedItem.id === activeTrackId);

  const handleDownloadWav = (item: HistoryItem) => {
    const safeName =
      item.voiceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      'svara-clip';

    if (item.audioBase64) {
      const binary = atob(item.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `svara-${safeName}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return;
    }

    if (item.clipId) {
      const anchor = document.createElement('a');
      anchor.href = `/api/clips/${item.clipId}.wav?download=1`;
      anchor.download = `svara-${safeName}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  const handleDownloadSubtitles = (item: HistoryItem, format: SubtitleFormat) => {
    if (!item.wordTimings?.length) return;
    const subText = generate_subtitles({
      wordTimings: item.wordTimings,
      format,
      preset: format === 'ass' ? 'rainbow_reels' : 'clean_editorial',
      maxLines,
      maxDurationSeconds: maxDurationSec,
      maxPhraseDurationMs: Math.round(maxDurationSec * 1000),
    });
    const blob = new Blob([subText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `svara-${item.clipId || item.id}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-4">
        <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mx-auto">
          <Mic2 className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h2 className="text-base font-semibold text-[#0F172A] dark:text-slate-100">
            No generated clips yet
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Generate speech in English, Hindi, or multi-speaker dialogue to save playable WAV clips, interactive waveforms, and .SRT / .VTT / .ASS captions here.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToStudio}
          className="px-4 h-10 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Open Speech Studio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="history-search-input" className="sr-only">
            Search generated speech history
          </label>
          <input
            id="history-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved clips by script or voice..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor="history-subtitle-lines"
              className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Subtitle Lines
            </label>
            <select
              id="history-subtitle-lines"
              value={maxLines}
              onChange={(e) => setMaxLines(Number(e.target.value) as 1 | 2 | 3)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
            >
              <option value={1}>1 Line</option>
              <option value={2}>2 Lines</option>
              <option value={3}>3 Lines</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="history-subtitle-duration"
              className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Max Cue
            </label>
            <select
              id="history-subtitle-duration"
              value={maxDurationSec}
              onChange={(e) => setMaxDurationSec(Number(e.target.value))}
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
            >
              <option value={2}>2.0s</option>
              <option value={2.6}>2.6s (Reels)</option>
              <option value={4}>4.0s (Editorial)</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums px-1">
            {filtered.length} {filtered.length === 1 ? 'clip' : 'clips'}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-200 dark:hover:border-red-900 transition-colors whitespace-nowrap"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Synchronized Interactive Waveform for Active / Selected History Clip */}
      {inspectedItem &&
        ((inspectedItem.wordTimings?.length ?? 0) > 0 ||
          (inspectedItem.waveformPeaks?.length ?? 0) > 0) && (
          <div data-testid="history-waveform-inspector">
            <InteractiveWaveform
              title={inspectedItem.textPreview}
              wordTimings={inspectedItem.wordTimings ?? []}
              waveformPeaks={inspectedItem.waveformPeaks}
              timingSource={inspectedItem.timingSource}
              timingConfidence={inspectedItem.timingConfidence}
              durationSec={
                isInspectedActive && playback.duration > 0
                  ? playback.duration
                  : inspectedItem.durationMs
                    ? inspectedItem.durationMs / 1000
                    : inspectedItem.durationSec
              }
              currentTime={isInspectedActive ? playback.currentTime : 0}
              isPlaying={isInspectedActive ? playback.isPlaying : false}
              hasAudio={Boolean(inspectedItem.audioBase64 || inspectedItem.clipId)}
              onTogglePlay={() => {
                if (isInspectedActive && playback.audioSrc) {
                  playback.togglePlay();
                } else {
                  onPlayItem(inspectedItem);
                }
              }}
              onSeek={(sec, autoPlay) => {
                if (!isInspectedActive) {
                  onPlayItem(inspectedItem);
                }
                playback.seekTo(sec, autoPlay);
              }}
            />
          </div>
        )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        {filtered.map((item) => {
          const isActive = item.id === activeTrackId;
          const dateLabel = new Date(item.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          const rateLabel = item.sampleRate
            ? `${(item.sampleRate / 1000).toFixed(item.sampleRate === 44100 ? 1 : 0)} kHz`
            : '48 kHz';
          const channelLabel = item.channels === 2 ? 'Stereo' : 'Mono';

          return (
            <div
              key={item.id}
              data-testid="history-clip-row"
              className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                isActive
                  ? 'bg-blue-50/40 dark:bg-blue-950/30'
                  : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onPlayItem(item)}
                  aria-label={`Play clip: ${item.textPreview}`}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                    isActive
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-[#0F172A] dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Play className="w-4 h-4 ml-0.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0F172A] dark:text-slate-100 truncate">
                    {item.textPreview}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    {item.voiceLabel} ·{' '}
                    {item.language === 'hi'
                      ? 'Hindi'
                      : item.language === 'bilingual'
                        ? 'Bilingual'
                        : 'English'}{' '}
                    · {rateLabel} {channelLabel} WAV · {formatAudioTime(item.durationSec)} ·{' '}
                    {item.wordTimings?.length ? `${item.wordTimings.length} words · ` : ''}
                    {dateLabel}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onRestoreToStudio(item)}
                  className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Load in Studio</span>
                </button>

                {item.wordTimings && item.wordTimings.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadSubtitles(item, 'srt')}
                      aria-label={`Download SRT subtitles for ${item.textPreview}`}
                      className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Captions className="w-3.5 h-3.5" />
                      <span>.SRT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSubtitles(item, 'vtt')}
                      aria-label={`Download VTT subtitles for ${item.textPreview}`}
                      className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <span>.VTT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSubtitles(item, 'ass')}
                      aria-label={`Download ASS captions for ${item.textPreview}`}
                      className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <span>.ASS</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => handleDownloadWav(item)}
                  aria-label={`Download WAV for ${item.textPreview}`}
                  className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download WAV</span>
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  aria-label={`Delete '${item.textPreview}'`}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-200 dark:hover:border-red-900 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
