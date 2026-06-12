import { fetchWorldCupNews } from '@/lib/news';

/**
 * World Cup news strip for the homepage. Live RSS via the news lib (cached +
 * stale-on-error). Renders nothing if the feed is unreachable — news being down
 * shouldn't leave a broken card on the page.
 */
function fmtWhen(pubDate: string | null): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default async function NewsWidget() {
  let items: Awaited<ReturnType<typeof fetchWorldCupNews>> = [];
  try {
    items = await fetchWorldCupNews();
  } catch {
    items = [];
  }
  if (items.length === 0) return null;

  return (
    <section className="brutal-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="brutal-h2">World Cup news</h2>
        <span className="text-xs opacity-100">Matches, scandals &amp; nonsense</span>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((n, i) => (
          <li key={i} className="border-[2px] border-current px-3 py-2 hover:bg-cga-cyan hover:text-cga-black">
            <a href={n.link} target="_blank" rel="noreferrer" className="block">
              <span className="block font-bold leading-snug">{n.title}</span>
              <span className="mt-0.5 block text-xs opacity-100">
                {n.source ?? 'News'}
                {n.source && fmtWhen(n.pubDate) ? ' · ' : ''}
                {fmtWhen(n.pubDate)}
                {' ↗'}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
