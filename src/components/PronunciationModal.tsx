import { useEffect, useState } from 'react';
import { BookOpen, Plus, Search, Trash2, X } from 'lucide-react';
import type { LanguageMode, PronunciationEntry } from '../types';

interface PronunciationModalProps {
  isOpen: boolean;
  entries: PronunciationEntry[];
  onClose: () => void;
  onSaveEntry: (entry: {
    id?: string;
    term: string;
    phonetic: string;
    ipa?: string;
    language: LanguageMode;
    notes?: string;
    enabled: boolean;
  }) => Promise<void> | void;
  onToggleEntry: (entry: PronunciationEntry) => Promise<void> | void;
  onDeleteEntry: (id: string) => Promise<void> | void;
}

const QUICK_EXAMPLES: Array<{
  term: string;
  phonetic: string;
  ipa?: string;
  language: LanguageMode;
  notes: string;
}> = [
  {
    term: 'Svara',
    phonetic: 'svuh-raa',
    ipa: '/svə.rɑː/',
    language: 'bilingual',
    notes: 'Sanskrit/Hindi musical note term',
  },
  {
    term: 'R4agRek0il',
    phonetic: 'Rag Rekoil',
    language: 'bilingual',
    notes: 'Creator handle / stylized gamertag',
  },
  {
    term: 'चक्रव्यूह',
    phonetic: 'chuh-kruh-vyooh',
    language: 'hi',
    notes: 'Clear compound syllable break in Hindi',
  },
];

export function PronunciationModal({
  isOpen,
  entries,
  onClose,
  onSaveEntry,
  onToggleEntry,
  onDeleteEntry,
}: PronunciationModalProps) {
  const [term, setTerm] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [ipa, setIpa] = useState('');
  const [language, setLanguage] = useState<LanguageMode>('bilingual');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.term.toLowerCase().includes(q) ||
      e.phonetic.toLowerCase().includes(q) ||
      (e.notes && e.notes.toLowerCase().includes(q))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !phonetic.trim()) {
      setFormError('Enter both the written word/noun and its phonetic pronunciation.');
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      await onSaveEntry({
        term: term.trim(),
        phonetic: phonetic.trim(),
        ipa: ipa.trim() || undefined,
        language,
        notes: notes.trim() || undefined,
        enabled: true,
      });
      setTerm('');
      setPhonetic('');
      setIpa('');
      setNotes('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save pronunciation rule.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pronunciation-modal-title"
        className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-[#2563EB] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="pronunciation-modal-title"
                className="text-base font-semibold text-[#0F172A] dark:text-slate-100 truncate"
              >
                Pronunciation Guide (English &amp; Hindi)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Define custom phonetic spellings for tricky terms or proper nouns without altering caption text.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Pronunciation Guide"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[#0F172A] dark:hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Add New Rule Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Add Custom Phonetic Rule
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Quick fill:</span>
                {QUICK_EXAMPLES.map((ex) => (
                  <button
                    key={ex.term}
                    type="button"
                    onClick={() => {
                      setTerm(ex.term);
                      setPhonetic(ex.phonetic);
                      setIpa(ex.ipa || '');
                      setLanguage(ex.language);
                      setNotes(ex.notes);
                      setFormError(null);
                    }}
                    className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {ex.term}
                  </button>
                ))}
              </div>
            </div>

            {formError && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {formError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="pron-term-input"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Word / Proper Noun
                </label>
                <input
                  id="pron-term-input"
                  type="text"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="e.g., Leidenfrost or बाहुबली"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label
                  htmlFor="pron-phonetic-input"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Phonetic Respelling
                </label>
                <input
                  id="pron-phonetic-input"
                  type="text"
                  value={phonetic}
                  onChange={(e) => setPhonetic(e.target.value)}
                  placeholder="e.g., LY-den-frost"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="pron-lang-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Language Scope
                </label>
                <select
                  id="pron-lang-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as LanguageMode)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="bilingual">Both (EN + HI)</option>
                  <option value="en">English Only</option>
                  <option value="hi">Hindi (हिन्दी) Only</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pron-ipa-input"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  IPA (Optional)
                </label>
                <input
                  id="pron-ipa-input"
                  type="text"
                  value={ipa}
                  onChange={(e) => setIpa(e.target.value)}
                  placeholder="/ˈlaɪdənfrɒst/"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label
                  htmlFor="pron-notes-input"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Notes (Optional)
                </label>
                <input
                  id="pron-notes-input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Stress on first syllable"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Pronunciation Rule'}</span>
              </button>
            </div>
          </form>

          {/* Existing Entries List */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                Saved Rules ({filtered.length})
              </span>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Filter pronunciation rules"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rules..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-[#0F172A] dark:text-slate-100 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No pronunciation rules match your search.
              </p>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span
                          className={`font-semibold ${
                            entry.enabled
                              ? 'text-[#0F172A] dark:text-slate-100'
                              : 'text-slate-400 line-through'
                          }`}
                        >
                          {entry.term}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">
                          →
                        </span>
                        <span className="font-mono text-xs text-[#2563EB] dark:text-blue-400">
                          {entry.phonetic}
                        </span>
                        {entry.ipa && (
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {entry.ipa}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {entry.language === 'hi'
                          ? 'Hindi'
                          : entry.language === 'en'
                            ? 'English'
                            : 'EN & HI'}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleEntry(entry)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                          entry.enabled
                            ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-400'
                        }`}
                      >
                        {entry.enabled ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteEntry(entry.id)}
                        aria-label={`Delete pronunciation rule for ${entry.term}`}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Active rules apply automatically to Studio synthesis &amp; MCP calls.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded-lg bg-[#0F172A] dark:bg-slate-100 text-white dark:text-[#0F172A] text-xs font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
