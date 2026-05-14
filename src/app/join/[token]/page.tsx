import Link from 'next/link';
import { redirect } from 'next/navigation';
import { findInviteByToken } from '@/lib/group-invite-db';
import { validateInvite } from '@/lib/group-invite';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Public landing for the shareable 24h group invite link. Validates the
 * token and forwards to /register with it pre-filled. Already-signed-in
 * visitors go straight home.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw ?? '');

  const session = await getSession();
  if (session.userId) redirect('/');

  const invite = await findInviteByToken(token);
  const result = validateInvite(invite, new Date());
  if (result.ok) {
    redirect(`/register?token=${encodeURIComponent(token)}`);
  }

  const reason =
    result.reason === 'expired'
      ? "This invite link has expired. Ask whoever shared it for a fresh one — they roll every 24 hours."
      : result.reason === 'used'
        ? 'This invite has already been used.'
        : "We don't recognise that invite token.";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-magenta">Sorry, no joy</h1>
        <p className="mt-3 text-sm">{reason}</p>
        <div className="mt-4 flex gap-2">
          <Link href="/login" className="brutal-btn-ghost text-sm">Sign in instead</Link>
        </div>
      </div>
    </div>
  );
}
