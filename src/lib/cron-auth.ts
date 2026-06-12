/**
 * Auth for unattended cron triggers (e.g. the hourly clanker results sync).
 *
 * A scheduler proves itself with `Authorization: Bearer <CRON_SECRET>`. We fail
 * closed: if no secret is configured on the server, every request is rejected,
 * so an un-provisioned deploy can't be poked anonymously.
 */

/** Constant-time-ish string compare — avoids leaking length-independent timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorizedCron(
  authHeader: string | null | undefined,
  secret: string | undefined | null,
): boolean {
  if (!secret) return false; // not configured → deny everything
  if (!authHeader) return false;
  return safeEqual(authHeader, `Bearer ${secret}`);
}
