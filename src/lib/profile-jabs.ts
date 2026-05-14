/**
 * Pure helpers for the Wall-of-Shame jabs on user profiles.
 *
 * Anyone can post on anyone's wall. Only the target (or an admin) can hide a
 * jab via soft delete; the author is locked in for the duration.
 */

export const MAX_JAB_LEN = 280;

export type JabValidation =
  | { ok: true; body: string }
  | { ok: false; reason: 'empty' | 'too-long' };

export function validateJabBody(raw: unknown): JabValidation {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (body.length === 0) return { ok: false, reason: 'empty' };
  if (body.length > MAX_JAB_LEN) return { ok: false, reason: 'too-long' };
  return { ok: true, body };
}
