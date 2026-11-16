import { useState } from 'react';
import { Mic } from 'lucide-react';

interface VoiceAvatarProps {
  src?: string;
  name: string;
  sizeClass?: string;
}

export function VoiceAvatar({ src, name, sizeClass = 'w-11 h-11' }: VoiceAvatarProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`${sizeClass} rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0`}
        aria-hidden="true"
      >
        <Mic className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} voice portrait`}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`${sizeClass} rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800`}
    />
  );
}
