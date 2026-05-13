import { fetchEvent, fetchPriceHistory } from '@/lib/polymarket';
import { layoutChart, type ChartSeries } from '@/lib/svg-chart';

// Re-fetch every 60s.
export const revalidate = 60;

const COLORS = ['#a3e3ff', '#3aa0ff', '#ffd23f', '#ff7a3d', '#ff3da3', '#9b6bff', '#3affb0', '#ff5c5c'];

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export default async function PolymarketPage() {
  let event: Awaited<ReturnType<typeof fetchEvent>> | null = null;
  let history: Awaited<ReturnType<typeof fetchPriceHistory>> = [];
  let error: string | null = null;
  try {
    event = await fetchEvent();
    history = await fetchPriceHistory(event.outcomes, 4);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load Polymarket data.';
  }

  if (error || !event) {
    return (
      <div className="space-y-4">
        <div className="brutal-card">
          <h1 className="brutal-h1">2026 World Cup Winner — Polymarket</h1>
          <p className="text-sm opacity-100 mt-2">Live odds from polymarket.com</p>
          <p className="brutal-error mt-3">Couldn't load Polymarket data: {error}</p>
          <p className="text-sm opacity-100 mt-2">
            If Polymarket renamed the event, set <code>POLYMARKET_EVENT_SLUG</code> in your env vars to the new slug.
          </p>
        </div>
      </div>
    );
  }

  const top4 = event.outcomes.slice(0, 4);
  const series: ChartSeries[] = history.map((h, i) => ({
    name: h.outcomeName,
    color: COLORS[i % COLORS.length],
    t: h.t,
    p: h.p,
  }));

  const chart = layoutChart(series, { width: 1000, height: 360 });

  return (
    <div className="space-y-4">
      <section className="brutal-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest opacity-100">Sports · Soccer</div>
            <h1 className="brutal-h1">{event.title}</h1>
          </div>
          <a
            href={`https://polymarket.com/event/${event.slug}`}
            target="_blank"
            rel="noreferrer"
            className="brutal-pill text-xs"
          >
            View on Polymarket ↗
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {top4.map((o, i) => (
            <span key={o.slug} className="inline-flex items-center gap-2 font-bold">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {o.name} <span className="opacity-100 tabular-nums">{(o.yesPrice * 100).toFixed(1)}%</span>
            </span>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="brutal-chart w-full" preserveAspectRatio="none">
            {/* Y gridlines */}
            {chart.yTicks.map((t, i) => (
              <g key={i}>
                <line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={t.y} y2={t.y} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 3" />
                <text x={chart.width - chart.pad.right + 6} y={t.y + 4} fontSize="11" fill="currentColor" fillOpacity="0.6">
                  {t.label}
                </text>
              </g>
            ))}
            {/* X tick labels only */}
            {chart.xTicks.map((t, i) => (
              <text key={i} x={t.x} y={chart.height - 8} fontSize="11" fill="currentColor" fillOpacity="0.6" textAnchor="middle">
                {t.label}
              </text>
            ))}
            {/* Series */}
            {chart.paths.map((p, i) => (
              <g key={i}>
                {p.d && <path d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                {p.endPoint && <circle cx={p.endPoint.x} cy={p.endPoint.y} r="4" fill={p.color} stroke="#000" strokeWidth="1.5" />}
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs opacity-100">
          <span>{fmtMoney(event.totalVolume)} Vol.</span>
          {event.endDate && <span>Resolves {new Date(event.endDate).toLocaleDateString()}</span>}
        </div>
      </section>

      <section className="brutal-card p-0">
        <ul>
          {event.outcomes.map((o) => (
            <li key={o.slug} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-current/10 px-4 py-3 last:border-b-0">
              {o.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={o.image} alt={o.name} className="h-9 w-9 rounded-sm border-2 border-black object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center border-2 border-black text-xs">{o.name.slice(0, 3).toUpperCase()}</span>
              )}
              <div>
                <div className="font-bold">{o.name}</div>
                <div className="text-xs opacity-100">{fmtMoney(o.volume)} Vol.</div>
              </div>
              <div className="text-2xl font-black tabular-nums">{Math.round(o.yesPrice * 100)}%</div>
              <a
                className="brutal-btn-yes tabular-nums"
                href={`https://polymarket.com/event/${event.slug}/${o.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                Buy Yes {(o.yesPrice * 100).toFixed(1)}¢
              </a>
              <a
                className="brutal-btn-no tabular-nums"
                href={`https://polymarket.com/event/${event.slug}/${o.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                Buy No {(o.noPrice * 100).toFixed(1)}¢
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs opacity-100">
        Live odds and chart sourced from Polymarket's public API · cached for 60s · Get Fooked is a tipping game, not a brokerage.
      </p>
    </div>
  );
}
