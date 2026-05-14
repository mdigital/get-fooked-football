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

/**
 * Global keydown listener for the Konami code. When the sequence matches,
 * opens a portaled fullscreen modal with the Flappy Bird easter egg.
 *
 * Listener bails out when the user is typing into a form input so the chat
 * composer doesn't fight the cheat detection.
 */
export function Konami() {
  const buffer = useRef<string[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
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
