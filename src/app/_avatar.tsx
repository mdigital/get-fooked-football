/* eslint-disable @next/next/no-img-element */
/**
 * Dumb avatar component — just a CGA-styled <img>. Takes a pre-resolved `src`
 * so this file has zero server-only imports (no node:crypto) and can be safely
 * bundled into client components like the leaderboard widget.
 *
 * Server callers compute the URL via `avatarFor()` from `@/lib/avatar`;
 * client callers receive a `src` that was computed server-side (e.g. on
 * BoardRow.avatarSrc).
 */
export function Avatar({
  src,
  name,
  size = 32,
  className = '',
}: {
  src: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={name ? `${name}'s avatar` : 'avatar'}
      width={size}
      height={size}
      className={`inline-block border-[2px] border-current ${className}`}
      style={{ width: size, height: size, objectFit: 'cover' }}
    />
  );
}
