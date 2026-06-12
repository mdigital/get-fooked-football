/**
 * World Cup news feed for the homepage.
 *
 * Reads a plain RSS feed (Google News search by default — a good mix of match
 * reports, scandals, transfer noise and silly-season fluff) and shapes it into
 * link items. Hand-rolled XML parsing keeps us dependency-light; the parse is a
 * pure function so it's unit-testable, and the fetch goes through the shared
 * cache so a slow/blocked feed never hammers upstream or hangs the page.
 *
 * Point it at any RSS feed via NEWS_RSS_URL.
 */
import { makeCachedResource } from './cached-fetch';

export type NewsItem = {
  title: string;
  link: string;
  source: string | null;
  /** Original RSS pubDate string (RFC-822), or null. */
  pubDate: string | null;
};

const DEFAULT_FEED =
  'https://news.google.com/rss/search?q=FIFA%20World%20Cup%202026&hl=en-US&gl=US&ceid=US:en';

const FEED_URL = process.env.NEWS_RSS_URL || DEFAULT_FEED;
const NEWS_TTL_MS = Number(process.env.NEWS_TTL_MS) || 30 * 60_000;
const NEWS_BACKOFF_MS = Number(process.env.NEWS_BACKOFF_MS) || 10 * 60_000;
const MAX_ITEMS = 8;

const USER_AGENT =
  process.env.NEWS_USER_AGENT ||
  'GetFooked/1.0 (+https://github.com/mdigital/get-fooked-football)';

function stripCdata(s: string): string {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  return m ? m[1] : s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // last, so we don't re-decode produced entities
}

function tagText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? decodeEntities(stripCdata(m[1]).trim()) : '';
}

/**
 * Pure: parse an RSS document into news items. Tolerant of CDATA, entity
 * encoding, and Google News' "Headline - Source" title convention.
 */
export function parseNewsRss(xml: string, limit = MAX_ITEMS): NewsItem[] {
  const out: NewsItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && out.length < limit) {
    const block = m[1];
    const rawTitle = tagText(block, 'title');
    const link = tagText(block, 'link');
    if (!rawTitle || !link) continue;
    const source = tagText(block, 'source');
    const pubDate = tagText(block, 'pubDate');
    // Google News appends " - Source" to titles; trim it when we already show
    // the source separately.
    let title = rawTitle;
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, title.length - source.length - 3).trim();
    }
    out.push({ title, link, source: source || null, pubDate: pubDate || null });
  }
  return out;
}

const newsResource = makeCachedResource<NewsItem[]>({
  ttlMs: NEWS_TTL_MS,
  errorBackoffMs: NEWS_BACKOFF_MS,
  fetcher: async () => {
    const res = await fetch(FEED_URL, {
      cache: 'no-store',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`news feed ${res.status} ${res.statusText}`);
    return parseNewsRss(await res.text());
  },
});

/** Cached World Cup news items. Returns [] worth of resilience via the shared cache. */
export function fetchWorldCupNews(): Promise<NewsItem[]> {
  return newsResource();
}
