import { ActivityFeed } from '../_activity-feed';

/**
 * Admin tab: the full-size activity timeline. The heavy lifting (cross-table
 * union, shaping, rendering) lives in <ActivityFeed>, shared with the
 * homepage "Latest cunting" widget.
 */
export async function AuditTab() {
  return (
    <section className="brutal-card">
      <h2 className="brutal-h2">Audit log</h2>
      <p className="text-sm opacity-100 mt-2">
        Chronological feed of recent activity. Covers profile hijacks (avatars + nicknames), curse casts and lifts,
        sitewide burns, wall-of-shame jabs, match comments, score edits, prize awards, and draw runs.
      </p>
      <div className="mt-4">
        <ActivityFeed limit={60} />
      </div>
    </section>
  );
}
