/**
 * Tiny write-side helper for `audit_events`. Server actions call this in a
 * single line; failures are swallowed so an audit hiccup never blocks the
 * thing the user was actually trying to do.
 */
import { db, schema } from '@/db/client';

export async function logAudit(args: {
  /** Human actor's user id. Omit (with actorName) for an automated agent. */
  userId?: number | null;
  /** Non-human actor label, e.g. "clanker". Used when userId is null. */
  actorName?: string | null;
  kind: string;
  targetUserId?: number | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await db.insert(schema.auditEvents).values({
      userId: args.userId ?? null,
      actorName: args.userId == null ? args.actorName ?? null : null,
      targetUserId: args.targetUserId ?? null,
      kind: args.kind,
      detail: args.detail ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] insert failed', err);
  }
}
