'use client';

import { useEffect, useState, useTransition } from 'react';
import { BOARD_META, type BoardKey, type BoardRow } from '@/lib/leaderboards-types';
import { Avatar } from '../_avatar';

type Props = {
  initialBoard: BoardKey;
  initialRows: BoardRow[];
  initialMeta: (typeof BOARD_META)[BoardKey];
};

export default function LeaderboardClient({ initialBoard, initialRows, initialMeta }: Props) {
  const [board, setBoard] = useState<BoardKey>(initialBoard);
  const [rows, setRows] = useState<BoardRow[]>(initialRows);
  const [meta, setMeta] = useState(initialMeta);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (board === initialBoard) return;
    let cancelled = false;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leaderboards?board=${board}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { rows: BoardRow[]; meta: (typeof BOARD_META)[BoardKey] };
        if (cancelled) return;
        setRows(data.rows);
        setMeta(data.meta);
        // Reflect the choice in the URL without a full reload.
        const u = new URL(window.location.href);
        u.searchParams.set('board', board);
        window.history.replaceState({}, '', u);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [board, initialBoard]);

  return (
    <>
      <div className="brutal-card">
        <h1 className="brutal-h1 brutal-heading-cyan">Leaderboards</h1>
        <p className="text-sm opacity-100 mt-2">Same points, different lenses. Pick a board.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-bold uppercase tracking-wide">Board</label>
          <select
            className="brutal-input w-auto"
            value={board}
            onChange={(e) => setBoard(e.target.value as BoardKey)}
          >
            {Object.entries(BOARD_META).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </select>
          {isPending && <span className="text-xs opacity-100">loading…</span>}
          {error && <span className="brutal-error text-xs">{error}</span>}
        </div>
      </div>

      <div className={`brutal-card transition-opacity ${isPending ? 'opacity-100' : 'opacity-100'}`}>
        <h2 className="brutal-h2">{meta.label}</h2>
        <p className="text-sm opacity-100">{meta.tagline}</p>
        <table className="mt-4 w-full text-left text-sm table-row-hover">
          <thead className="text-xs uppercase opacity-100">
            <tr>
              <th className="py-2">#</th>
              <th>Player</th>
              <th className="text-right">Teams</th>
              <th className="text-right">Raw pts</th>
              <th className="text-right">{meta.unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center opacity-100">
                  No players yet — admin needs to invite people and run the draw.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.userId} className="border-t border-black/5">
                <td className="py-2 tabular-nums">{i + 1}</td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <Avatar user={{ email: r.email, avatarUrl: r.avatarUrl, name: r.name }} size={24} />
                    {r.name}
                  </span>
                </td>
                <td className="text-right tabular-nums">{r.teamCount}</td>
                <td className="text-right tabular-nums">{r.points}</td>
                <td className="text-right font-semibold tabular-nums">{r.weightedPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
