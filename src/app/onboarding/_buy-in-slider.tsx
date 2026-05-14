'use client';

import { useState } from 'react';
import { BUY_IN_DEFAULT, BUY_IN_MAX, BUY_IN_MIN, BUY_IN_STEP } from '@/lib/buy-in';

/**
 * CGA-styled buy-in slider. Shows a big live value so the user knows what
 * they're pledging at a glance. The same value is submitted via the
 * `name="buy_in"` hidden input regardless of how the user manipulates it.
 */
export function BuyInSlider({ initial = BUY_IN_DEFAULT }: { initial?: number }) {
  const [val, setVal] = useState(initial);

  const tier =
    val < 40 ? 'easy mode' : val < 80 ? 'reasonable' : val < 200 ? 'standard' : val < 400 ? 'sweaty' : 'whale';

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-5xl md:text-6xl font-bold tabular-nums">${val}</div>
          <div className="mt-1 text-xs uppercase font-bold opacity-100">{tier}</div>
        </div>
        <div className="text-xs uppercase font-bold opacity-100 text-right">
          ${BUY_IN_MIN} min · ${BUY_IN_MAX} max
        </div>
      </div>
      <input
        type="range"
        name="buy_in"
        min={BUY_IN_MIN}
        max={BUY_IN_MAX}
        step={BUY_IN_STEP}
        value={val}
        onChange={(e) => setVal(Number(e.target.value))}
        className="w-full accent-cga-magenta"
        aria-label="Buy-in amount in NZD"
      />
      <div className="flex flex-wrap gap-2">
        {[BUY_IN_MIN, 50, 100, 200, BUY_IN_MAX].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVal(v)}
            className={`brutal-pill cursor-pointer ${v === val ? 'bg-cga-cyan text-cga-black' : ''}`}
          >
            ${v}
          </button>
        ))}
      </div>
    </div>
  );
}
