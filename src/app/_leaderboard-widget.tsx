'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { BOARD_META, type BoardKey, type BoardRow } from '@/lib/leaderboards-types';

/**
 * Compact homepage leaderboard widget: shows the top 5 for the chosen board
 * and lets the user switch boards from a dropdown without leaving the page.
 */
export default function LeaderboardWidget({
  initialBoard,
  initialRows,
}: {
  initialBoard: BoardKey;
  initialRows: BoardRow[];
}) {
  const [board, setBoard] = useState<BoardKey>(initialBoard);
  const [rows, setRows] = useState<BoardRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (board === initialBoard && rows === initialRows) return;
    let cancelled = false;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leaderboards?board=${board}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { rows: BoardRow[] };
        if (cancelled) return;
        setRows(data.rows);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed');
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  const meta = BOARD_META[board];

  return (
    <div className="brutal-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="brutal-h2">Leaderboard</h2>
        <select
          className="brutal-input w-auto py-1 text-sm"
          value={board}
          onChange={(e) => setBoard(e.target.value as BoardKey)}
        >
          {Object.entries(BOARD_META).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs opacity-100 mt-1">{meta.tagline}</p>

      <div className={`mt-3 transition-opacity ${pending ? 'opacity-100' : 'opacity-100'}`}>
        {rows.length === 0 ? (
          <p className="opacity-100">Once the draw is done and matches start, scores show up here.</p>
        ) : (
          <ol className="space-y-1">
            {rows.slice(0, 5).map((row, i) => (
              <li key={row.userId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-[2px] border-current px-2 py-1">
                <span className="font-bold tabular-nums">{i + 1}.</span>
                <span className="truncate">{row.name}</span>
                <span className="text-sm font-bold tabular-nums">
                  {row.weightedPoints} <span className="text-xs opacity-100">{meta.unit}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {error && <p className="brutal-error mt-2 text-xs">{error}</p>}
      </div>

      <Link href={`/leaderboards?board=${board}`} className="mt-3 inline-block text-sm brutal-link">
        Full board →
      </Link>
    </div>
  );
}
