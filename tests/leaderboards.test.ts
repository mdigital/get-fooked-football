import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/leaderboards';
import { finishedGroup, makeTeam, makeUser } from './helpers/factories';

describe('computeLeaderboard', () => {
  const users = [makeUser({ id: 1, name: 'Robin' }), makeUser({ id: 2, name: 'Sam' })];
  // Robin owns 2 sheep-heavy nations; Sam owns 2 huge-population nations.
  // Team 5 is unassigned (leftover); team 6 is a filler opponent so fixtures resolve cleanly.
  const teams = [
    makeTeam({ id: 1, name: 'New Zealand', population: 5_000_000, sheep: 25_000_000, fifaRank: 95 }),
    makeTeam({ id: 2, name: 'Wales', population: 3_000_000, sheep: 10_000_000, fifaRank: 30 }),
    makeTeam({ id: 3, name: 'India-like', population: 1_000_000_000, sheep: 1_000_000, fifaRank: 100 }),
    makeTeam({ id: 4, name: 'USA-like', population: 300_000_000, sheep: 5_000_000, fifaRank: 16 }),
    makeTeam({ id: 5, name: 'Leftover', population: 1, sheep: 1, fifaRank: 1 }),
    makeTeam({ id: 6, name: 'Filler', population: 0, sheep: 0, fifaRank: 200 }),
  ];
  const assignments = [
    { teamId: 1, userId: 1, isLeftover: false },
    { teamId: 2, userId: 1, isLeftover: false },
    { teamId: 3, userId: 2, isLeftover: false },
    { teamId: 4, userId: 2, isLeftover: false },
    { teamId: 5, userId: null, isLeftover: true },
    { teamId: 6, userId: null, isLeftover: true },
  ];

  // Each of the four assigned teams beats Filler 1-0 → +4 (3 win + 1 goal).
  const fixtures = [
    finishedGroup(1, 1, 0, 1, 6),
    finishedGroup(2, 1, 0, 2, 6),
    finishedGroup(3, 1, 0, 3, 6),
    finishedGroup(4, 1, 0, 4, 6),
  ];

  it('overall: raw points, sorted desc, tie broken by name', () => {
    const board = computeLeaderboard('overall', users, teams, assignments, fixtures);
    expect(board.map((r) => [r.name, r.points])).toEqual([
      ['Robin', 8],
      ['Sam', 8],
    ]);
  });

  it('population: weights big populations higher', () => {
    const board = computeLeaderboard('population', users, teams, assignments, fixtures);
    expect(board[0].name).toBe('Sam'); // 1.3B population × 8 pts ≫ Robin's 8M × 8 pts
  });

  it('sheep: weights woolly nations higher', () => {
    const board = computeLeaderboard('sheep', users, teams, assignments, fixtures);
    expect(board[0].name).toBe('Robin'); // 35M sheep ≫ 6M sheep
  });

  it('underdog: weights weaker teams higher (higher FIFA rank number)', () => {
    const board = computeLeaderboard('fifa_underdog', users, teams, assignments, fixtures);
    // Robin avg rank (95+30)/2 = 62.5; Sam (100+16)/2 = 58. Robin wins.
    expect(board[0].name).toBe('Robin');
  });

  it('group_only equals overall when there are no KO results', () => {
    const overall = computeLeaderboard('overall', users, teams, assignments, fixtures);
    const grpOnly = computeLeaderboard('group_only', users, teams, assignments, fixtures);
    expect(grpOnly.map((r) => [r.name, r.points])).toEqual(overall.map((r) => [r.name, r.points]));
  });

  it('ko_only is zero when only group games are finished', () => {
    const ko = computeLeaderboard('ko_only', users, teams, assignments, fixtures);
    expect(ko.every((r) => r.points === 0)).toBe(true);
  });

  it('leftover teams do not contribute to anyone — even if they score 9 goals', () => {
    const extra = [...fixtures, finishedGroup(5, 9, 0, 5, 6)]; // leftover (5) thrashes filler (6)
    const board = computeLeaderboard('overall', users, teams, assignments, extra);
    expect(board.every((r) => r.points === 8)).toBe(true);
  });

  it('schadenfreude: awards +3 per cursed-team loss, independent of team assignments', () => {
    // Robin curses team 6 (the filler that just lost 4 times). Sam curses
    // team 1, which won — so no points.
    const curses = [
      { userId: 1, teamId: 6 },
      { userId: 2, teamId: 1 },
    ];
    const board = computeLeaderboard('schadenfreude', users, teams, assignments, fixtures, curses);
    const robin = board.find((r) => r.name === 'Robin')!;
    const sam = board.find((r) => r.name === 'Sam')!;
    expect(robin.points).toBe(12); // 4 cursed-team losses × 3
    expect(sam.points).toBe(0);
    expect(board[0].name).toBe('Robin');
  });

  it('schadenfreude with no curses returns all-zero rows, not a crash', () => {
    const board = computeLeaderboard('schadenfreude', users, teams, assignments, fixtures);
    expect(board.every((r) => r.points === 0)).toBe(true);
    expect(board).toHaveLength(users.length);
  });

  it('flappy: orders by best survival per user, formats as seconds', () => {
    const u = (id: number, name: string) => ({
      id,
      name,
      nickname: null,
      email: `${name.toLowerCase()}@example.com`,
      avatarUrl: null,
    });
    const flappyRows = [
      // Robin posts 3.21s and 6.10s — best is 6.10s.
      { userId: 1, survivedMs: 3210, pipesCleared: 2, createdAt: new Date('2026-06-01T10:00:00Z'), user: u(1, 'Robin') },
      { userId: 1, survivedMs: 6100, pipesCleared: 6, createdAt: new Date('2026-06-02T10:00:00Z'), user: u(1, 'Robin') },
      // Sam posts 4.40s.
      { userId: 2, survivedMs: 4400, pipesCleared: 3, createdAt: new Date('2026-06-01T11:00:00Z'), user: u(2, 'Sam') },
    ];
    const board = computeLeaderboard('flappy', users, teams, assignments, fixtures, [], flappyRows);
    expect(board[0].name).toBe('Robin');
    expect(board[0].displayValue).toBe('6.10s');
    expect(board[1].name).toBe('Sam');
    expect(board[1].displayValue).toBe('4.40s');
  });

  it('flappy with no runs shows dash and zero points for every user', () => {
    const board = computeLeaderboard('flappy', users, teams, assignments, fixtures, [], []);
    expect(board).toHaveLength(users.length);
    expect(board.every((r) => r.weightedPoints === 0)).toBe(true);
    expect(board.every((r) => r.displayValue === '—')).toBe(true);
  });
});

describe('computeLeaderboard — Petrostate Cup (oil)', () => {
  const users = [makeUser({ id: 1, name: 'Robin' }), makeUser({ id: 2, name: 'Sam' })];
  // Robin owns the USA (huge oil); Sam owns NZ (a trickle). A filler opponent
  // sits leftover so fixtures resolve.
  const teams = [
    makeTeam({ id: 1, name: 'United States', code: 'USA' }), // 4.7e9 bbl/yr
    makeTeam({ id: 2, name: 'New Zealand', code: 'NZL' }), //    7e6 bbl/yr
    makeTeam({ id: 9, name: 'Filler', code: 'ZZZ' }), //         0 bbl/yr
  ];
  const assignments = [
    { teamId: 1, userId: 1, isLeftover: false },
    { teamId: 2, userId: 2, isLeftover: false },
    { teamId: 9, userId: null, isLeftover: true },
  ];
  // USA score 3, NZ score 2 (goals are what count here, not match points).
  const fixtures = [finishedGroup(1, 3, 0, 1, 9), finishedGroup(2, 2, 0, 2, 9)];

  it('weights goals by annual oil production and shows goals as raw points', () => {
    const board = computeLeaderboard('oil', users, teams, assignments, fixtures);
    const robin = board.find((r) => r.name === 'Robin')!;
    const sam = board.find((r) => r.name === 'Sam')!;
    expect(robin.points).toBe(3); // goals, not match points
    expect(sam.points).toBe(2);
    expect(robin.weightedPoints).toBe(3 * (4_700_000_000 / 1_000_000)); // 14100
    expect(sam.weightedPoints).toBe(2 * (7_000_000 / 1_000_000)); // 14
    expect(board[0].name).toBe('Robin');
  });
});
