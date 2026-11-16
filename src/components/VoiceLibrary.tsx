import { useState } from 'react';
import { ArrowUpRight, Loader2, Play, Search } from 'lucide-react';
import { VOICE_PRESETS } from '../data/voices';
import type { VoiceCategory, VoicePreset } from '../types';
import { filterVoices } from '../utils/speechLogic';
import { VoiceAvatar } from './VoiceAvatar';

interface VoiceLibraryProps {
  selectedVoiceId: string;
  previewingVoiceId: string | null;
  onPreviewVoice: (voice: VoicePreset) => void;
  onUseInStudio: (voice: VoicePreset) => void;
}

const LANGUAGE_FILTERS: Array<'All' | 'English' | 'Hindi' | 'Bilingual'> = [
  'All',
  'English',
  'Hindi',
  'Bilingual',
];

const CATEGORY_FILTERS: Array<'All' | VoiceCategory> = [
  'All',
  'Narration',
  'Conversational',
  'Characters',
  'News & Anchor',
  'Wellness',
];

export function VoiceLibrary({
  selectedVoiceId,
  previewingVoiceId,
  onPreviewVoice,
  onUseInStudio,
}: VoiceLibraryProps) {
  const [query, setQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState<
    'All' | 'English' | 'Hindi' | 'Bilingual'
  >('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | VoiceCategory>('All');

  const filtered = filterVoices(VOICE_PRESETS, query, languageFilter, categoryFilter);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="voice-search-input" className="sr-only">
              Search voices by name, style, or language
            </label>
            <input
              id="voice-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search voices by name, Hindi, noir, anchor..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 self-start"
            role="group"
            aria-label="Filter by language"
          >
            {LANGUAGE_FILTERS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguageFilter(lang)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  languageFilter === lang
                    ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  categoryFilter === cat
                    ? 'border-[#0F172A] dark:border-[#2563EB] bg-[#0F172A] dark:bg-[#2563EB] text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Showing {filtered.length} of {VOICE_PRESETS.length} voices
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#0F172A] dark:text-slate-100">
            No voices match your filters
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reset search or switch language to All to explore every English and Hindi voice.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setLanguageFilter('All');
              setCategoryFilter('All');
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((voice) => {
            const isSelected = voice.id === selectedVoiceId;
            const isPreviewing = previewingVoiceId === voice.id;
            return (
              <article
                key={voice.id}
                className={`bg-white dark:bg-slate-900 rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isSelected
                    ? 'border-[#2563EB]'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <VoiceAvatar
                      src={voice.portraitUrl}
                      name={voice.name}
                      sizeClass="w-12 h-12"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-[#0F172A] dark:text-slate-100 truncate">
                          {voice.name} — {voice.roleTitle}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {voice.language} · {voice.category} · {voice.accent}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {voice.description}
                  </p>

                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-2.5">
                    “{voice.sampleText}”
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onPreviewVoice(voice)}
                    disabled={previewingVoiceId !== null}
                    className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    {isPreviewing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Synthesizing...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Preview Sample</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onUseInStudio(voice)}
                    className={`inline-flex items-center gap-1 px-3.5 h-9 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                        : 'bg-[#0F172A] dark:bg-[#2563EB] text-white hover:bg-slate-800 dark:hover:bg-blue-700'
                    }`}
                  >
                    <span>{isSelected ? 'Active in Studio' : 'Use in Studio'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
