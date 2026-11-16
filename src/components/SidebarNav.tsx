import { AudioWaveform, Clock, Library, Mic2, Plug } from 'lucide-react';
import type { LanguageMode } from '../types';

export type ActiveTab = 'studio' | 'voices' | 'history' | 'mcp';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  historyCount: number;
  voiceCount: number;
  activeLanguage: LanguageMode;
  onQuickSelectLanguage: (lang: LanguageMode) => void;
}

export function SidebarNav({
  activeTab,
  onSelectTab,
  historyCount,
  voiceCount,
  activeLanguage,
  onQuickSelectLanguage,
}: SidebarNavProps) {
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof Mic2;
    count?: number;
  }> = [
    { id: 'studio', label: 'Speech Studio', icon: Mic2 },
    { id: 'voices', label: 'Voice Library', icon: Library, count: voiceCount },
    { id: 'history', label: 'History', icon: Clock, count: historyCount },
    { id: 'mcp', label: 'MCP Connect', icon: Plug },
  ];

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="h-14 px-5 flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-[#0F172A] dark:bg-[#2563EB] text-white flex items-center justify-center shrink-0">
          <AudioWaveform className="w-4 h-4" />
        </div>
        <span className="font-semibold text-[17px] tracking-tight text-[#0F172A] dark:text-slate-100 whitespace-nowrap">
          Svara Studio
        </span>
      </div>

      <nav className="flex-1 p-3 space-y-1" aria-label="Workspace navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                isActive
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0F172A] dark:text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-[#0F172A] dark:hover:text-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-[#2563EB]' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </span>
              {typeof item.count === 'number' && (
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Active Language Focus
        </p>
        <div
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          role="group"
          aria-label="Language focus"
        >
          {(
            [
              { id: 'en', label: 'EN' },
              { id: 'hi', label: 'हिन्दी' },
              { id: 'bilingual', label: 'Both' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onQuickSelectLanguage(opt.id)}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                activeLanguage === opt.id
                  ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Supports English, Devanagari Hindi, and natural Hinglish scripts.
        </p>
      </div>
    </aside>
  );
}
