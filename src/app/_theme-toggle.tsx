'use client';

import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark' | 'system';

/**
 * Cycles through light → dark → system. The actual class on <html> is set by
 * the synchronous bootstrap script in layout.tsx before hydration so there's
 * no flash; this component just persists the preference and re-applies on
 * change.
 */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Mode | null) ?? 'system';
    setMode(stored);
  }, []);

  useEffect(() => {
    const apply = () => {
      const stored = (localStorage.getItem('theme') as Mode | null) ?? 'system';
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const dark = stored === 'dark' || (stored === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [mode]);

  const cycle = () => {
    const next: Mode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    localStorage.setItem('theme', next);
    setMode(next);
  };

  const label = mode === 'light' ? '☀ LIGHT' : mode === 'dark' ? '☾ DARK' : '◐ AUTO';

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${mode} (click to cycle)`}
      className="border-[3px] border-current px-2 py-1 text-xs font-bold uppercase hover:bg-cga-cyan hover:text-cga-black"
    >
      {label}
    </button>
  );
}
