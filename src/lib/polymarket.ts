/**
 * Polymarket data layer for the "2026 FIFA World Cup Winner" event.
 *
 * Uses Polymarket's public Gamma API + CLOB price-history endpoint. No auth required for reads.
 * Cached briefly on the server so the page can be rendered without thrashing their API.
 */

import { makeCachedResource } from './cached-fetch';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

// Override via env var if Polymarket renames the event slug.
export const EVENT_SLUG = process.env.POLYMARKET_EVENT_SLUG || 'fifa-world-cup-2026-winner';

export type PolyOutcome = {
  /** Team name as Polymarket lists it ("France", "Spain", …) */
  name: string;
  /** Outcome image URL (usually a flag) */
  image?: string;
  /** Yes price in dollars (0..1). 0.18 → 18% probability. */
  yesPrice: number;
  /** No price in dollars (0..1). Usually 1 - yesPrice ± spread. */
  noPrice: number;
  /** USD volume on this sub-market */
  volume: number;
  /** Token id used to query the CLOB price-history endpoint */
  yesTokenId?: string;
  /** Single-market slug, useful for deep-linking back to Polymarket */
  slug: string;
};

export type PolyEvent = {
  title: string;
  slug: string;
  totalVolume: number;
  endDate: string | null;
  outcomes: PolyOutcome[];
};

export type PriceSeries = {
  outcomeName: string;
  /** ms-epoch */
  t: number[];
  /** 0..1 */
  p: number[];
};

// Odds drift slowly and this is a tipping game, not a trading desk — cache hard
// so we make at most a handful of upstream calls an hour no matter how many
// people are browsing. The shared cache also serves stale data on error and
// backs off, so a Polymarket hiccup or rate-limit doesn't blank the UI or get
// us blocked. Override via env for tuning without a redeploy.
const EVENT_TTL_MS = Number(process.env.POLYMARKET_TTL_MS) || 5 * 60_000;
const SERIES_TTL_MS = Number(process.env.POLYMARKET_SERIES_TTL_MS) || 30 * 60_000;
const ERROR_BACKOFF_MS = Number(process.env.POLYMARKET_BACKOFF_MS) || 5 * 60_000;

// A descriptive UA + Accept. Default server-side fetch sends no User-Agent,
// which some edges/WAFs treat as a bot and 403/429. Identifying ourselves is
// the single most common fix for "works in the browser, blocked from the server".
const REQUEST_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent':
    process.env.POLYMARKET_USER_AGENT ||
    'GetFooked/1.0 (+https://github.com/mdigital/get-fooked-football)',
};

async function getJson<T>(url: string): Promise<T> {
  // We do our own caching/backoff in makeCachedResource, so opt the fetch itself
  // out of Next's Data Cache — one source of truth, no surprise double-caching.
  // Time-box it so a hung upstream can't stall a server-rendered page.
  const res = await fetch(url, {
    cache: 'no-store',
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Polymarket ${res.status} ${res.statusText} fetching ${url}`);
  }
  return res.json() as Promise<T>;
}

// Some Gamma fields are JSON-encoded strings; tolerate either shape.
function maybeParseJson<T>(v: unknown): T | null {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return (v as T) ?? null;
}

type RawMarket = {
  id: string;
  slug: string;
  question?: string;
  groupItemTitle?: string;
  image?: string;
  icon?: string;
  outcomePrices?: string | string[];
  clobTokenIds?: string | string[];
  volume?: number | string;
  volumeNum?: number;
};

type RawEvent = {
  title: string;
  slug: string;
  endDate?: string | null;
  volume?: number | string;
  volumeNum?: number;
  markets?: RawMarket[];
};

/**
 * Pure: shape a raw Gamma `events` payload into our PolyEvent. Exported so the
 * fiddly price/token-array parsing is unit-testable without the network.
 */
export function parsePolyEvent(events: RawEvent[]): PolyEvent {
  if (!events?.length) {
    throw new Error(`No Polymarket event found for slug "${EVENT_SLUG}". Set POLYMARKET_EVENT_SLUG to the correct one.`);
  }
  const raw = events[0];
  const outcomes: PolyOutcome[] = (raw.markets ?? [])
    .map((m) => {
      const prices = maybeParseJson<string[]>(m.outcomePrices) ?? [];
      const tokens = maybeParseJson<string[]>(m.clobTokenIds) ?? [];
      const yes = Number(prices[0] ?? 0);
      const no = Number(prices[1] ?? Math.max(0, 1 - yes));
      const vol = Number(m.volumeNum ?? m.volume ?? 0);
      return {
        name: m.groupItemTitle ?? m.question ?? m.slug,
        image: m.icon ?? m.image,
        yesPrice: yes,
        noPrice: no,
        volume: vol,
        yesTokenId: tokens[0],
        slug: m.slug,
      };
    })
    .sort((a, b) => b.yesPrice - a.yesPrice);

  return {
    title: raw.title,
    slug: raw.slug,
    totalVolume: Number(raw.volumeNum ?? raw.volume ?? 0),
    endDate: raw.endDate ?? null,
    outcomes,
  };
}

const eventResource = makeCachedResource<PolyEvent>({
  ttlMs: EVENT_TTL_MS,
  errorBackoffMs: ERROR_BACKOFF_MS,
  fetcher: async () => {
    const events = await getJson<RawEvent[]>(`${GAMMA_BASE}/events?slug=${encodeURIComponent(EVENT_SLUG)}`);
    return parsePolyEvent(events);
  },
});

/** Cached World Cup winner market. `force` bypasses the cache (used by the admin price sync). */
export function fetchEvent(force = false): Promise<PolyEvent> {
  return eventResource(force);
}

const seriesResource = makeCachedResource<PriceSeries[]>({
  ttlMs: SERIES_TTL_MS,
  errorBackoffMs: ERROR_BACKOFF_MS,
  fetcher: async () => {
    const event = await eventResource();
    const top = event.outcomes.slice(0, 4);
    return Promise.all(
      top.map(async (o) => {
        if (!o.yesTokenId) return { outcomeName: o.name, t: [], p: [] } as PriceSeries;
        try {
          const r = await getJson<{ history: { t: number; p: number }[] }>(
            `${CLOB_BASE}/prices-history?market=${o.yesTokenId}&interval=max&fidelity=720`,
          );
          return {
            outcomeName: o.name,
            t: r.history.map((h) => h.t * 1000),
            p: r.history.map((h) => h.p),
          };
        } catch {
          return { outcomeName: o.name, t: [], p: [] };
        }
      }),
    );
  },
});

/**
 * Cached price history for the top 4 outcomes. The `outcomes` arg is accepted
 * for backwards-compatibility but the cached resource derives them from the
 * event itself, so callers can pass `event.outcomes` or nothing.
 */
export function fetchPriceHistory(_outcomes?: PolyOutcome[], _topN = 4): Promise<PriceSeries[]> {
  return seriesResource();
}
