import { describe, it, expect } from 'vitest';
import { makeCachedResource } from '@/lib/cached-fetch';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (d: number) => { t += d; } };
}

describe('makeCachedResource', () => {
  it('fetches once and serves the cache within the TTL', async () => {
    const c = clock();
    let calls = 0;
    const get = makeCachedResource({ ttlMs: 1000, now: c.now, fetcher: async () => ++calls });
    expect(await get()).toBe(1);
    c.advance(500);
    expect(await get()).toBe(1);
    expect(calls).toBe(1);
  });

  it('refetches once the TTL has elapsed', async () => {
    const c = clock();
    let calls = 0;
    const get = makeCachedResource({ ttlMs: 1000, now: c.now, fetcher: async () => ++calls });
    await get();
    c.advance(1001);
    expect(await get()).toBe(2);
  });

  it('serves the last good value when a refetch fails (stale-on-error)', async () => {
    const c = clock();
    let calls = 0;
    const get = makeCachedResource({
      ttlMs: 1000,
      errorBackoffMs: 0,
      now: c.now,
      fetcher: async () => {
        calls++;
        if (calls === 1) return 'good';
        throw new Error('429 blocked');
      },
    });
    expect(await get()).toBe('good');
    c.advance(2000);
    expect(await get()).toBe('good'); // stale, not a throw
  });

  it('propagates the error when nothing has ever been cached', async () => {
    const c = clock();
    const get = makeCachedResource({
      ttlMs: 1000,
      now: c.now,
      fetcher: async () => {
        throw new Error('down');
      },
    });
    await expect(get()).rejects.toThrow('down');
  });

  it('backs off after an error: no upstream call within the backoff window', async () => {
    const c = clock();
    let calls = 0;
    const get = makeCachedResource({
      ttlMs: 1000,
      errorBackoffMs: 5000,
      now: c.now,
      fetcher: async () => {
        calls++;
        if (calls >= 2) throw new Error('blocked');
        return 'v1';
      },
    });
    await get(); // calls=1, cached 'v1'
    c.advance(1001); // past TTL
    await get(); // calls=2 → throws internally, served stale, error timestamp set
    expect(calls).toBe(2);
    c.advance(1001); // past TTL again but within backoff
    expect(await get()).toBe('v1');
    expect(calls).toBe(2); // did NOT hit upstream again
  });

  it('coalesces concurrent callers into a single in-flight fetch', async () => {
    const c = clock();
    let calls = 0;
    let release!: (v: number) => void;
    const get = makeCachedResource({
      ttlMs: 1000,
      now: c.now,
      fetcher: () => {
        calls++;
        return new Promise<number>((res) => { release = res; });
      },
    });
    const a = get();
    const b = get();
    release(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(calls).toBe(1);
  });

  it('force bypasses a fresh cache', async () => {
    const c = clock();
    let calls = 0;
    const get = makeCachedResource({ ttlMs: 100000, now: c.now, fetcher: async () => ++calls });
    await get();
    expect(await get(true)).toBe(2);
  });
});
