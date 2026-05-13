import Link from 'next/link';
import { fetchEvent } from '@/lib/polymarket';

const SWATCH = ['#55ffff', '#ff55ff', '#ffffff', '#aaaaaa', '#888888'];

/**
 * Compact World-Cup-winner odds widget for the homepage. Live from Polymarket.
 * Renders nothing visible (just a tiny placeholder) if the API is unreachable —
 * Polymarket being down shouldn't break the homepage.
 */
export default async function PolymarketWidget() {
  let event;
  try {
    event = await fetchEvent();
  } catch {
    return (
      <div className="brutal-card">
        <h2 className="brutal-h2">Polymarket odds</h2>
        <p className="text-sm opacity-100 mt-2">Couldn't reach Polymarket. Try again in a minute.</p>
      </div>
    );
  }
  const top = event.outcomes.slice(0, 5);
  return (
    <div className="brutal-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="brutal-h2">Polymarket — WC '26 winner</h2>
        <a
          href={`https://polymarket.com/event/${event.slug}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs brutal-link"
        >
          Open ↗
        </a>
      </div>
      <ul className="mt-3 space-y-1">
        {top.map((o, i) => (
          <li key={o.slug} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-2 border-[2px] border-current px-2 py-1">
            <span className="block h-3 w-3" style={{ background: SWATCH[i % SWATCH.length] }} />
            <span className="truncate text-sm font-bold">{o.name}</span>
            <span className="text-xs opacity-100 tabular-nums">{fmtMoney(o.volume)}</span>
            <span className="text-base font-bold tabular-nums">{(o.yesPrice * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
      <Link href="/polymarket" className="mt-2 inline-block text-sm brutal-link">
        Full board →
      </Link>
    </div>
  );
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
