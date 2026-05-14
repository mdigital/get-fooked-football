/* eslint-disable @next/next/no-img-element */
import { avatarFor, type AvatarUser } from '@/lib/avatar';

/**
 * Tiny avatar component. Uses a plain <img> (rather than next/image) so we
 * don't have to whitelist gravatar.com in next.config — keeps the static
 * export simple. CGA-style hard border, no rounded corners.
 */
export function Avatar({
  user,
  size = 32,
  className = '',
}: {
  user: AvatarUser & { name?: string };
  size?: number;
  className?: string;
}) {
  const src = avatarFor(user, size * 2); // 2× for retina
  return (
    <img
      src={src}
      alt={user.name ? `${user.name}'s avatar` : 'avatar'}
      width={size}
      height={size}
      className={`inline-block border-[2px] border-current ${className}`}
      style={{ width: size, height: size, objectFit: 'cover' }}
    />
  );
}
