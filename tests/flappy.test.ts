import { describe, it, expect } from 'vitest';
import { formatSurvivedMs, rankPersonalBests, type FlappyScoreRow } from '@/lib/flappy';

const u = (id: number, name: string, nickname: string | null = null) => ({
  id,
  name,
  nickname,
  email: `${name.toLowerCase()}@example.com`,
  avatarUrl: null,
});

describe('formatSurvivedMs', () => {
  it('renders sub-second runs to 2dp', () => {
    expect(formatSurvivedMs(0)).toBe('0.00s');
    expect(formatSurvivedMs(50)).toBe('0.05s');
  });
  it('handles whole seconds', () => {
    expect(formatSurvivedMs(1000)).toBe('1.00s');
  });
  it('handles minutes-long runs', () => {
    expect(formatSurvivedMs(60040)).toBe('60.04s');
  });
  it('floors weird input to zero', () => {
    expect(formatSurvivedMs(Number.NaN)).toBe('0.00s');
    expect(formatSurvivedMs(-5)).toBe('0.00s');
  });
});

describe('rankPersonalBests', () => {
  it('returns one row per user (best survival)', () => {
    const rows: FlappyScoreRow[] = [
      { userId: 1, survivedMs: 3000, pipesCleared: 4, createdAt: new Date('2026-06-01T10:00:00Z'), user: u(1, 'Robin') },
      { userId: 1, survivedMs: 8000, pipesCleared: 9, createdAt: new Date('2026-06-02T10:00:00Z'), user: u(1, 'Robin') },
      { userId: 2, survivedMs: 5000, pipesCleared: 6, createdAt: new Date('2026-06-01T11:00:00Z'), user: u(2, 'Sam') },
    ];
    const out = rankPersonalBests(rows);
    expect(out).toHaveLength(2);
    expect(out[0].userId).toBe(1);
    expect(out[0].bestMs).toBe(8000);
    expect(out[1].userId).toBe(2);
  });

  it('sorts by survival time descending', () => {
    const rows: FlappyScoreRow[] = [
      { userId: 1, survivedMs: 3000, pipesCleared: 1, createdAt: new Date('2026-06-01T10:00:00Z'), user: u(1, 'Robin') },
      { userId: 2, survivedMs: 9000, pipesCleared: 1, createdAt: new Date('2026-06-01T11:00:00Z'), user: u(2, 'Sam') },
      { userId: 3, survivedMs: 6000, pipesCleared: 1, createdAt: new Date('2026-06-01T12:00:00Z'), user: u(3, 'Liz') },
    ];
    expect(rankPersonalBests(rows).map((r) => r.userId)).toEqual([2, 3, 1]);
  });

  it('tiebreaks by pipesCleared desc', () => {
    const rows: FlappyScoreRow[] = [
      { userId: 1, survivedMs: 5000, pipesCleared: 3, createdAt: new Date('2026-06-01T10:00:00Z'), user: u(1, 'Robin') },
      { userId: 2, survivedMs: 5000, pipesCleared: 7, createdAt: new Date('2026-06-01T11:00:00Z'), user: u(2, 'Sam') },
    ];
    expect(rankPersonalBests(rows)[0].userId).toBe(2);
  });

  it('tiebreaks ties by earliest run', () => {
    const rows: FlappyScoreRow[] = [
      { userId: 1, survivedMs: 5000, pipesCleared: 3, createdAt: new Date('2026-06-01T10:00:00Z'), user: u(1, 'Robin') },
      { userId: 2, survivedMs: 5000, pipesCleared: 3, createdAt: new Date('2026-06-01T11:00:00Z'), user: u(2, 'Sam') },
    ];
    expect(rankPersonalBests(rows)[0].userId).toBe(1);
  });

  it('renders display names with nicknames', () => {
    const rows: FlappyScoreRow[] = [
      {
        userId: 1,
        survivedMs: 1000,
        pipesCleared: 0,
        createdAt: new Date('2026-06-01T00:00:00Z'),
        user: u(1, 'Robin', 'Sheep Lord'),
      },
    ];
    expect(rankPersonalBests(rows)[0].displayName).toBe('Robin "Sheep Lord"');
  });

  it('is empty for no input', () => {
    expect(rankPersonalBests([])).toEqual([]);
  });
});
