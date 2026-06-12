/**
 * Tiny in-process cache for flaky third-party reads (Polymarket odds, news RSS).
 *
 * It does three things that keep us from getting rate-limited / blocked and from
 * blanking the UI when an upstream has a wobble:
 *   1. TTL caching   — one upstream hit per `ttlMs`, shared across all requests.
 *   2. Single-flight  — concurrent callers during a miss share one fetch, so a
 *                       burst of page loads doesn't fan out into N upstream hits.
 *   3. Stale-on-error — if a refetch fails we keep serving the last good value,
 *                       and back off for `errorBackoffMs` before trying again so
 *                       we don't hammer an API that's already pushing back.
 *
 * `now` is injectable so the behaviour is unit-testable without real timers.
 */

export type Clock = () => number;

export interface CachedResourceOptions<T> {
  /** Serve cached data without re-fetching for this long. */
  ttlMs: number;
  /** After a failed fetch, wait this long before hitting upstream again (serving
   *  stale meanwhile). Defaults to min(ttlMs, 60s). */
  errorBackoffMs?: number;
  fetcher: () => Promise<T>;
  now?: Clock;
}

export type CachedResource<T> = (force?: boolean) => Promise<T>;

export function makeCachedResource<T>(opts: CachedResourceOptions<T>): CachedResource<T> {
  const now = opts.now ?? Date.now;
  const backoffMs = opts.errorBackoffMs ?? Math.min(opts.ttlMs, 60_000);

  let data: T | null = null;
  let fetchedAt = 0;
  let erroredAt = 0;
  let inFlight: Promise<T> | null = null;

  return function get(force = false): Promise<T> {
    const t = now();
    const haveData = data !== null;
    const fresh = haveData && t - fetchedAt < opts.ttlMs;
    if (!force && fresh) return Promise.resolve(data as T);
    // Recently errored and we have something to show → don't keep poking upstream.
    if (!force && haveData && erroredAt > 0 && t - erroredAt < backoffMs) {
      return Promise.resolve(data as T);
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const next = await opts.fetcher();
        data = next;
        fetchedAt = now();
        return next;
      } catch (err) {
        erroredAt = now();
        if (data !== null) return data; // serve the last good value instead of throwing
        throw err;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
