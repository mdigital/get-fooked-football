'use client';

import { useState, useTransition } from 'react';

export default function ThumbButton({
  photoId,
  initialVoted,
  initialCount,
  disabled,
}: {
  photoId: number;
  initialVoted: boolean;
  initialCount: number;
  disabled?: boolean;
}) {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 border-[3px] border-black bg-white px-3 py-1 text-sm font-bold shadow-brutal-sm">
        👍 {count}
      </span>
    );
  }

  const onClick = () => {
    setError(null);
    // Optimistic update so the button feels instant.
    const nextVoted = !voted;
    const nextCount = count + (nextVoted ? 1 : -1);
    setVoted(nextVoted);
    setCount(nextCount);
    startTransition(async () => {
      try {
        const res = await fetch('/api/inswap/vote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ photoId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { voted: boolean; count: number };
        // Reconcile with the server's truth in case our optimistic guess was wrong.
        setVoted(data.voted);
        setCount(data.count);
      } catch (e) {
        // Roll back optimistic update on failure.
        setVoted(!nextVoted);
        setCount(count);
        setError(e instanceof Error ? e.message : 'failed');
      }
    });
  };

  return (
    <button
      onClick={onClick}
      disabled={pending}
      type="button"
      title={error ?? undefined}
      className={`inline-flex items-center gap-1 border-[3px] border-black px-3 py-1 text-sm font-bold shadow-brutal-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
        voted ? 'bg-neon-lime' : 'bg-white hover:-translate-y-[1px]'
      } ${pending ? 'opacity-100' : ''}`}
    >
      👍 {count}
    </button>
  );
}
