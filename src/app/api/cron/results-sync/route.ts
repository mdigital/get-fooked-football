import { NextResponse } from 'next/server';
import { runResultsSync } from '@/lib/results-sync-db';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Unattended trigger for the clanker (TheSportsDB results sync). Designed to be
 * called hourly by the `.github/workflows/clanker.yml` scheduled workflow:
 *
 *   POST /api/cron/results-sync
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Re-running is safe by construction — the sync skips human-edited and
 * already-current fixtures — so retries and overlapping pings don't double-edit.
 */
async function handle(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runResultsSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return handle(req);
}

// Also accept GET so a plain cron pinger (or a quick manual curl) works; the
// Bearer secret still gates it and the sync is idempotent.
export async function GET(req: Request) {
  return handle(req);
}
