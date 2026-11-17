import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Globe,
  RefreshCw,
  Volume2,
  WifiOff,
  XCircle,
} from 'lucide-react';
import type { EngineTier, ProviderHealthSnapshot } from '../types';

interface ConnectionStatusBadgeProps {
  health: ProviderHealthSnapshot;
  engineTier: EngineTier;
  voiceCount: number;
  isChecking: boolean;
  onRecheck: () => void;
  onSelectEngineTier: (tier: EngineTier) => void;
}

export function deriveHeaderConnectionMode(
  health: ProviderHealthSnapshot,
  engineTier: EngineTier
): {
  mode: 'offline' | 'cloud' | 'keyless';
  label: string;
  description: string;
} {
  if (!health.browserOnline || !health.serverReachable) {
    return {
      mode: 'offline',
      label: 'Offline Mode',
      description:
        health.offlineReason ||
        'Network or server unreachable. Using browser OS Web Speech synthesis.',
    };
  }
  if (health.fallbackActive || engineTier === 'webspeech') {
    return {
      mode: 'offline',
      label: 'Offline Mode',
      description:
        health.fallbackReason ||
        'Local client-side Web Speech synthesis is active (zero API keys required).',
    };
  }
  if (engineTier === 'keyless' || !health.providers.gemini) {
    return {
      mode: 'keyless',
      label: 'Keyless Ready',
      description:
        'Cloud quota key unavailable or bypassed; free keyless TTS server fallback is online.',
    };
  }
  return {
    mode: 'cloud',
    label: 'Cloud Ready',
    description:
      'Gemini Cloud TTS and free keyless fallback providers are online.',
  };
}

export function ConnectionStatusBadge({
  health,
  engineTier,
  voiceCount,
  isChecking,
  onRecheck,
  onSelectEngineTier,
}: ConnectionStatusBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const status = deriveHeaderConnectionMode(health, engineTier);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const badgeToneClass =
    status.mode === 'offline'
      ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950'
      : status.mode === 'keyless'
        ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950'
        : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950';

  const checkedText = health.lastCheckedAt
    ? new Date(health.lastCheckedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Not checked';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="connection-status-badge"
        data-status-mode={status.mode}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Provider connection status: ${status.label}`}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${badgeToneClass}`}
      >
        {status.mode === 'offline' ? (
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
        ) : status.mode === 'keyless' ? (
          <Globe className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Cloud className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{status.label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="TTS provider connection monitor"
          data-testid="connection-status-popover"
          className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-4 z-50 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#0F172A] dark:text-slate-100">
                Provider &amp; Synthesis Status
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {status.description}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Gemini Cloud TTS</span>
              <span className="inline-flex items-center gap-1 font-medium">
                {health.serverReachable && health.providers.gemini ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-300">Ready</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-700 dark:text-amber-300">Unavailable</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Server Keyless TTS</span>
              <span className="inline-flex items-center gap-1 font-medium">
                {health.serverReachable && health.providers.keyless ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-300">Online</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    <span className="text-red-700 dark:text-red-300">Offline</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">OpenAI / ElevenLabs</span>
              <span className="text-slate-500 dark:text-slate-400">
                {health.providers.openai || health.providers.elevenlabs
                  ? 'Configured'
                  : 'Not configured'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Browser Web Speech</span>
              <span className="inline-flex items-center gap-1 font-medium">
                <Volume2 className="w-3.5 h-3.5 text-[#2563EB] dark:text-blue-400" />
                <span className="text-[#0F172A] dark:text-slate-100 tabular-nums">
                  {health.webSpeechSupported ? `Ready (${voiceCount} OS voices)` : 'Unsupported'}
                </span>
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>Checked: {checkedText}</span>
            {health.build && <span>{health.build}</span>}
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={onRecheck}
              disabled={isChecking}
              data-testid="recheck-providers-btn"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking...' : 'Recheck Providers'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectEngineTier(engineTier === 'webspeech' ? 'standard' : 'webspeech');
              }}
              data-testid="toggle-offline-mode-btn"
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              {engineTier === 'webspeech' ? 'Use Cloud Auto' : 'Use Local Voices'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
