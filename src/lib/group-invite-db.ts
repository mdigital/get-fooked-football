/**
 * DB-aware wrappers around the pure helpers in `group-invite.ts`. Kept thin —
 * any business logic that doesn't need the DB should live in the pure module.
 */
import { db, schema } from '@/db/client';
import { desc, eq } from 'drizzle-orm';
import { generateInviteToken } from '@/lib/auth';
import { groupInviteExpiry } from '@/lib/group-invite';

/**
 * Latest group invite row (multiUse=true), if any. Newest by createdAt wins —
 * older rolls are kept around so old links return "expired" cleanly rather
 * than "unknown" (slightly nicer UX) and so audit history is preserved.
 */
export async function getCurrentGroupInvite() {
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.multiUse, true))
    .orderBy(desc(schema.invites.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Generate a fresh group invite token valid for 24h. Doesn't delete old ones. */
export async function rollGroupInvite(createdByUserId: number): Promise<string> {
  const token = generateInviteToken();
  const expiresAt = groupInviteExpiry(new Date());
  await db.insert(schema.invites).values({
    token,
    note: 'GROUP_INVITE',
    multiUse: true,
    expiresAt,
    createdByUserId,
  });
  return token;
}

/**
 * Look up an invite by token. Returns null if missing.
 */
export async function findInviteByToken(token: string) {
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.token, token))
    .limit(1);
  return rows[0] ?? null;
}
