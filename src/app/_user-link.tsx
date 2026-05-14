import Link from 'next/link';

/**
 * Render a username as a link to the user's profile page.
 *
 * - When userId resolves we link to /profile/<id> (the existing profile route
 *   handles self vs other internally).
 * - When userId is missing (deleted user, anonymous edit, etc.) we render
 *   a plain span and degrade gracefully.
 *
 * Keeps the visual style minimal: inherits color and underlines on hover
 * so it fits into any surface — comment headers, leaderboard rows, admin
 * tables — without bringing brutal-link's heavy magenta/cyan flip with it.
 */
export function UserLink({
  userId,
  name,
  className = '',
  fallback = 'someone',
  children,
}: {
  userId: number | null | undefined;
  name: string | null | undefined;
  className?: string;
  fallback?: string;
  children?: React.ReactNode;
}) {
  const label = children ?? name ?? fallback;
  if (userId == null) return <span className={className}>{label}</span>;
  return (
    <Link
      href={`/profile/${userId}`}
      className={`hover:underline decoration-2 underline-offset-2 ${className}`}
    >
      {label}
    </Link>
  );
}
