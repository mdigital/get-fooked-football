'use client';

import { useState, useTransition } from 'react';

/**
 * Optimistic thumbs-up for a nickname. Toggles via /api/nicknames/vote and
 * reconciles with the server's count — no page reload. Signed-out users get a
 * sign-in link in the button's place.
 */
export default function NicknameVoteButton({
  nickname,
  initialVoted,
  initialCount,
  signedIn,
}: {
  nickname: string;
  initialVoted: boolean;
  initialCount: number;
  signedIn: boolean;
}) {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const base =
    'inline-flex items-center gap-2 border-[3px] border-current px-3 py-2 text-sm font-black uppercase';

  if (!signedIn) {
    return (
      <a href="/login" className={`${base} hover:bg-cga-cyan hover:text-cga-black`} title="Sign in to vote">
        👍 <span className="tabular-nums">{count}</span>
      </a>
    );
  }

  const onClick = () => {
    setError(null);
    // Optimistic flip so it feels instant.
    const nextVoted = !voted;
    setVoted(nextVoted);
    setCount((c) => c + (nextVoted ? 1 : -1));
    startTransition(async () => {
      try {
        const res = await fetch('/api/nicknames/vote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nickname }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { voted: boolean; count: number };
        setVoted(data.voted); // reconcile with server truth
        setCount(data.count);
      } catch (e) {
        // Roll back the optimistic guess.
        setVoted(!nextVoted);
        setCount((c) => c + (nextVoted ? -1 : 1));
        setError(e instanceof Error ? e.message : 'failed');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={error ?? (voted ? 'Remove your vote' : 'Vote for this nickname')}
      className={`${base} ${voted ? 'bg-cga-cyan text-cga-black' : 'hover:bg-cga-magenta hover:text-cga-black'} ${
        pending ? 'opacity-70' : ''
      }`}
    >
      👍 <span>{voted ? 'Voted' : 'Vote'}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
