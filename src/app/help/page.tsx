import Link from 'next/link';

export const metadata = { title: 'Help — Get Fooked' };

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <h1 className="brutal-h1">How it works</h1>
        <p className="text-sm opacity-100 mt-2">
          The 30-second tour of Get Fooked. If you're stuck on something, ping whoever invited you.
        </p>
      </div>

      <section className="brutal-card">
        <h2 className="brutal-h2">The basics</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>You get an invite link from someone in the league. Use it to <Link className="brutal-link" href="/register">register</Link>.</li>
          <li>Once the admin runs the <strong>draw</strong>, you'll be randomly allocated a handful of teams from the 48 going to the 2026 World Cup. Any teams left over go into a special pot for fun side prizes (the Wooden Spoon, the Cinderella Cup, etc.).</li>
          <li>Points accumulate automatically as match results are entered. <strong>Anyone</strong> in the league can post a result from the match page — every edit is logged so you can see who said what.</li>
          <li>There are six different <Link className="brutal-link" href="/leaderboards">leaderboards</Link>. Same raw points, weighted by different things, so even if you're not winning the main one you might be smashing the sheep board.</li>
          <li>The <Link className="brutal-link" href="/inswap">InSwap League</Link> photo competition runs alongside the football — upload your best face-swap, thumbs-up everyone else's, and the standings settle via hot-or-not playoffs.</li>
        </ol>
      </section>

      <section className="brutal-card">
        <h2 className="brutal-h2">Scoring</h2>
        <p>Per match a team earns:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Group stage</strong>: win 3, draw 1, loss 0, plus 1 point per goal scored (capped at 4).</li>
          <li><strong>Knockouts</strong>: same goal points, plus an advance bonus — R32 +4, R16 +6, QF +8, SF +12.</li>
          <li><strong>Final</strong>: champion +30, runner-up +15.</li>
        </ul>
        <p className="mt-3">Your league score is the sum of points across every team you were assigned. Leftover teams don't count for any player, but they're still tracked and feed the side prizes.</p>
      </section>

      <section className="brutal-card">
        <h2 className="brutal-h2">Leaderboards</h2>
        <p>You're ranked six different ways. The dropdown on <Link className="brutal-link" href="/leaderboards">/leaderboards</Link> switches between them:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Overall</strong> — raw points.</li>
          <li><strong>By Population</strong> — points × combined population of your teams. Big countries pay.</li>
          <li><strong>By Sheep</strong> — points × total sheep across your teams. The Wool Cup.</li>
          <li><strong>Underdog Cup</strong> — points × average FIFA rank. The worse your draw, the bigger the multiplier.</li>
          <li><strong>Group Stage Only</strong> / <strong>Knockout Only</strong> — filtered to the relevant phase.</li>
        </ul>
      </section>

      <section className="brutal-card">
        <h2 className="brutal-h2">Match pages</h2>
        <p>Click any fixture to open its match page. From there you can:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Update the score</strong> — anyone signed in can do this. Edits are appended to the audit history so we can see who made which change.</li>
          <li><strong>Drop sticker reactions</strong> on the canvas — emoji from the quick buttons, custom emoji, or image stickers. On iPhone, long-press a sticker in Messages or Photos → <em>Copy</em>, then paste it into the upload box.</li>
        </ul>
      </section>

      <section className="brutal-card">
        <h2 className="brutal-h2">InSwap League</h2>
        <p>The photo competition that runs alongside the football.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Upload a JPG/PNG/WEBP/GIF (6MB max) on <Link className="brutal-link" href="/inswap">/inswap</Link>.</li>
          <li>Everyone gives a thumbs-up to as many as they want. Toggling on and off doesn't double-count.</li>
          <li>If the top is tied, the <Link className="brutal-link" href="/inswap/hot-or-not">Hot-or-Not</Link> playoff settles it head-to-head.</li>
        </ul>
      </section>

      <section className="brutal-card">
        <h2 className="brutal-h2">Prizes</h2>
        <p>$100 NZD each in the pot. Grand prize is $400 — the rest is broken into a bunch of weird, small prizes:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The Wool Cup, The People's Trophy — winners of the themed boards.</li>
          <li>Wooden Spoon, Bin Fire — for the duds.</li>
          <li>Cinderella Cup, Best Group Stage, Best Knockout Stage, Top Scorer Owner.</li>
          <li>InSwap League winner.</li>
        </ul>
        <p className="mt-3">See the full list on <Link className="brutal-link" href="/prizes">/prizes</Link>.</p>
      </section>

      <section className="brutal-card">
        <h2 className="brutal-h2">Polymarket</h2>
        <p>The <Link className="brutal-link" href="/polymarket">/polymarket</Link> page shows live odds for the 2026 World Cup Winner straight from Polymarket. It's read-only — Get Fooked is a tipping game, not a brokerage. Useful for arguments though.</p>
      </section>
    </div>
  );
}
