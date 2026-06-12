import { describe, it, expect } from 'vitest';
import { parseNewsRss } from '@/lib/news';

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>World Cup news</title>
  <item>
    <title><![CDATA[Ref blows up: VAR chaos in opener - BBC Sport]]></title>
    <link>https://news.google.com/articles/abc123</link>
    <pubDate>Thu, 11 Jun 2026 18:30:00 GMT</pubDate>
    <source url="https://bbc.co.uk">BBC Sport</source>
  </item>
  <item>
    <title>Mascot escapes stadium, leads police on merry chase &amp; eats a pie - The Guardian</title>
    <link>https://news.google.com/articles/def456</link>
    <pubDate>Fri, 12 Jun 2026 09:00:00 GMT</pubDate>
    <source url="https://theguardian.com">The Guardian</source>
  </item>
  <item>
    <title>No source suffix here</title>
    <link>https://example.com/x</link>
  </item>
</channel></rss>`;

describe('parseNewsRss', () => {
  it('parses each item title, link, source and pubDate', () => {
    const items = parseNewsRss(SAMPLE);
    expect(items).toHaveLength(3);
    expect(items[0].link).toBe('https://news.google.com/articles/abc123');
    expect(items[0].source).toBe('BBC Sport');
    expect(items[0].pubDate).toBe('Thu, 11 Jun 2026 18:30:00 GMT');
  });

  it('unwraps CDATA and strips the trailing " - Source" suffix', () => {
    const items = parseNewsRss(SAMPLE);
    expect(items[0].title).toBe('Ref blows up: VAR chaos in opener');
  });

  it('decodes HTML entities in titles', () => {
    const items = parseNewsRss(SAMPLE);
    expect(items[1].title).toBe('Mascot escapes stadium, leads police on merry chase & eats a pie');
  });

  it('keeps the full title when there is no source to strip', () => {
    const items = parseNewsRss(SAMPLE);
    expect(items[2].title).toBe('No source suffix here');
    expect(items[2].source).toBeNull();
    expect(items[2].pubDate).toBeNull();
  });

  it('respects the limit', () => {
    expect(parseNewsRss(SAMPLE, 2)).toHaveLength(2);
  });

  it('returns [] for non-RSS / empty input', () => {
    expect(parseNewsRss('<html>not rss</html>')).toEqual([]);
    expect(parseNewsRss('')).toEqual([]);
  });

  it('skips items missing a title or link', () => {
    const xml = `<rss><channel>
      <item><link>https://x.test/a</link></item>
      <item><title>Has both</title><link>https://x.test/b</link></item>
    </channel></rss>`;
    const items = parseNewsRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Has both');
  });
});
