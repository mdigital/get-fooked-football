import { createHash } from 'node:crypto';

/**
 * Profile-picture helpers. Pure — no DB, no fs, no network.
 *
 * Strategy: if a user uploaded their own avatar we just serve that path.
 * Otherwise we fall back to Gravatar, computed deterministically from
 * the lowercased + trimmed email per the Gravatar spec.
 */

export const GRAVATAR_BASE = 'https://www.gravatar.com/avatar/';

/** Default fallback when a Gravatar isn't registered. "retro" gives 8-bit-y
 *  pixel art which matches our CGA vibe; "identicon" is the safe alt. */
export const GRAVATAR_DEFAULT = 'retro';

export type AvatarUser = {
  email: string;
  avatarUrl?: string | null;
};

/** MD5 of the lowercased + trimmed email — Gravatar's required hash. */
export function gravatarHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

export function gravatarUrl(email: string, size = 80): string {
  return `${GRAVATAR_BASE}${gravatarHash(email)}?s=${size}&d=${GRAVATAR_DEFAULT}`;
}

/** Resolve the URL to render for a user, preferring their uploaded avatar. */
export function avatarFor(user: AvatarUser, size = 80): string {
  if (user.avatarUrl && user.avatarUrl.trim().length > 0) return user.avatarUrl;
  return gravatarUrl(user.email, size);
}
