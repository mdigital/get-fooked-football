'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlappyGame } from './_flappy';

/** Classic Konami code: ↑ ↑ ↓ ↓ ← → ← → B A */
const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const;

/** Public name of the event sibling components dispatch to force the modal
 *  open. Used by _konami-trigger.tsx and the URL-param shortcut below. */
export const KONAMI_OPEN_EVENT = 'konami:open';

/**
 * Prints a cryptic, CGA-styled invitation in the devtools console. Anyone
 * who opens the inspector should be able to figure out there's a hidden
 * game, without us spelling it out.
 *
 * Only fires once per page load via the `hintPrinted` guard so HMR /
 * StrictMode double-effects don't spam it.
 */
let hintPrinted = false;
function printHint() {
  if (typeof window === 'undefined' || hintPrinted) return;
  hintPrinted = true;
  const banner =
    'background:#ff55ff;color:#000;font-weight:bold;padding:6px 12px;' +
    'font-family:ui-monospace,"IBM Plex Mono",monospace;font-size:14px;letter-spacing:0.05em';
  const cyan = 'color:#55ffff;font-family:ui-monospace,monospace';
  const magenta = 'color:#ff55ff;font-family:ui-monospace,monospace;font-weight:bold';
  const dim = 'color:#888;font-family:ui-monospace,monospace';
  const fg = 'color:#fff;font-family:ui-monospace,monospace';
  /* eslint-disable no-console */
  console.log('%c▓▒░ GET FOOKED ░▒▓', banner);
  console.log(
    '%c       __\n%c      (o_o)>—\n%c       --',
    magenta,
    magenta,
    magenta,
  );
  console.log('%cthere is a bird. it remembers 1986.', cyan);
  console.log('%cten keystrokes. two letters at the end.', fg);
  console.log('%c(or knock politely:) %cwindow.__openFlappy()', dim, magenta);
  /* eslint-enable no-console */
}

/**
 * Global keydown listener for the Konami code. When the sequence matches,
 * opens a portaled fullscreen modal with the Flappy Bird easter egg.
 *
 * Listener bails out when the user is typing into a form input so the chat
 * composer doesn't fight the cheat detection. Also responds to:
 *  - The custom `konami:open` event (dispatched by the triple-click trigger
 *    on the header ⚽ '26 badge — a no-arrow-keys alternative).
 *  - The URL search param `?konami=1` (deep link / mobile fallback).
 *  - The global function `window.__openFlappy()` for devtools poking.
 */
export function Konami() {
  const buffer = useRef<string[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    printHint();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      buffer.current.push(key);
      if (buffer.current.length > SEQUENCE.length) {
        buffer.current = buffer.current.slice(-SEQUENCE.length);
      }
      if (buffer.current.length === SEQUENCE.length) {
        let match = true;
        for (let i = 0; i < SEQUENCE.length; i++) {
          if (buffer.current[i] !== SEQUENCE[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          buffer.current = [];
          setOpen(true);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Custom-event trigger (used by the header badge triple-click).
  useEffect(() => {
    const onOpen = () => {
      // eslint-disable-next-line no-console
      console.log('[konami] open event received');
      setOpen(true);
    };
    window.addEventListener(KONAMI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(KONAMI_OPEN_EVENT, onOpen);
  }, []);

  // URL-param trigger + devtools backdoor on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('konami') === '1') setOpen(true);
    } catch {
      /* ignore */
    }
    (window as unknown as { __openFlappy?: () => void }).__openFlappy = () => setOpen(true);
    return () => {
      try {
        delete (window as unknown as { __openFlappy?: () => void }).__openFlappy;
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Flappy Bird easter egg"
      className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.9)', zIndex: 2147483647 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold uppercase text-cga-cyan">
            <span className="ansi-magenta">▓▒░</span> FLAPPY <span className="ansi-magenta">░▒▓</span>
          </h2>
          <button
            type="button"
            onClick={close}
            className="border-[2px] border-cga-white text-cga-white px-2 py-1 text-xs font-bold uppercase hover:bg-cga-magenta hover:text-cga-black"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <FlappyGame onClose={close} />
      </div>
    </div>,
    document.body,
  );
}
