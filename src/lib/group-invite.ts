/**
 * Pure helpers for the rolling 24h group invite link.
 *
 * The whole crew shares one token at /join/<token>; admins re-roll it from
 * the admin panel. Single-use email invites (legacy) still work — they're
 * just rows with multiUse=false / expiresAt=null.
 */

export const GROUP_INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export type InviteShape = {
  token: string;
  usedByUserId: number | null;
  multiUse: boolean;
  expiresAt: Date | null;
};

export type InviteValidation =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'used' | 'expired' };

/**
 * Decide whether an invite token can be used to register right now.
 * - Single-use tokens: reject if already consumed.
 * - Multi-use group tokens: reject if past expiry.
 */
export function validateInvite(invite: InviteShape | null | undefined, now: Date): InviteValidation {
  if (!invite) return { ok: false, reason: 'unknown' };
  if (invite.multiUse) {
    if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true };
  }
  if (invite.usedByUserId != null) return { ok: false, reason: 'used' };
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

/** Compute expiry timestamp for a freshly-rolled group invite. */
export function groupInviteExpiry(now: Date): Date {
  return new Date(now.getTime() + GROUP_INVITE_TTL_MS);
}

/**
 * Human-readable "23h 12m left" / "4m left" / "expired". Returns nice
 * round-down units so a copy-paste confirms the link still has plenty
 * of life in it.
 */
export function formatTimeRemaining(expiresAt: Date | null, now: Date): string {
  if (!expiresAt) return 'no expiry';
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 'expired';
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 1) return `${hours}h ${mins}m left`;
  if (mins >= 1) return `${mins}m left`;
  return '< 1m left';
}
