'use client';

import { useEffect, useState } from 'react';

/**
 * Single source of truth for the "how the league works" explainer.
 * Rendered as a brutal modal overlay with the CGA palette. Can be dropped
 * anywhere — header, onboarding, anywhere — and each instance manages its
 * own open state.
 */
export function HowItWorksButton({
  className = 'brutal-btn-ghost text-xs',
  label = 'How it works',
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-it-works-title"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          // Custom dim — the CGA palette is too saturated for a tinted overlay,
          // so just go to solid-ish black behind the card.
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="brutal-card max-w-2xl w-full bg-white text-cga-black dark:bg-cga-black dark:text-cga-white">
            <div className="flex items-start justify-between gap-3">
              <h2 id="how-it-works-title" className="brutal-h1 brutal-heading-magenta">How it works</h2>
              <button
                type="button"
                className="border-[3px] border-current px-2 py-1 text-xs font-bold uppercase hover:bg-cga-cyan hover:text-cga-black"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <section>
                <h3 className="brutal-h2 mb-1">The pot</h3>
                <p>
                  Everyone pledges what they can afford between <strong>$20</strong> and <strong>$500</strong>. The total
                  pot is the sum of everyone's pledges. Prizes are <strong>percentages of the pot</strong>, so they
                  scale with the crew — no one is locked out.
                </p>
              </section>

              <section>
                <h3 className="brutal-h2 mb-1">Your teams</h3>
                <p>
                  You don't pick teams directly — you pick <strong>three preferences</strong> and the draw does its
                  best. Everyone gets exactly one top seed, then the rest balance across the field by Polymarket odds.
                  Anything left over goes into a side pool used for the Wooden Spoon, Cinderella Cup, etc.
                </p>
              </section>

              <section>
                <h3 className="brutal-h2 mb-1">Scoring</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Group:</strong> win 3, draw 1, loss 0 — plus 1 point per goal (capped at 4/match).</li>
                  <li><strong>Knockouts:</strong> goal points carry; winner picks up an advance bonus (R32 +4, R16 +6, QF +8, SF +12).</li>
                  <li><strong>Final:</strong> champion +30, runner-up +15.</li>
                </ul>
                <p className="mt-1">Your overall score is the sum across every team allocated to you.</p>
              </section>

              <section>
                <h3 className="brutal-h2 mb-1">Boards &amp; prizes</h3>
                <p>
                  Same points, different lenses — overall, group-only, knockouts-only, weighted by population, by
                  sheep (yes, sheep), or by FIFA rank for the underdog cup. There's an InSwap photo league too, plus
                  one-off awards like Wooden Spoon, Bin Fire and Tournament Top Scorer Owner.
                </p>
              </section>
            </div>

            <div className="mt-5 flex justify-end">
              <button type="button" className="brutal-btn-primary" onClick={() => setOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
