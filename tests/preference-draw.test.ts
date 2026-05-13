import { describe, it, expect } from 'vitest';
import { planPreferenceDraw, type DrawTeam, type DrawPlayer } from '@/lib/preference-draw';
import { mulberry32 } from '@/lib/draw';

// Build a 48-team field with a clean odds gradient — team 1 has the highest
// price, team 48 the lowest. Lets us reason about "top seeds" cleanly.
function buildField(): DrawTeam[] {
  return Array.from({ length: 48 }, (_, i) => ({
    id: i + 1,
    polymarketPrice: (48 - i) / 100, // 0.48 .. 0.01
  }));
}

function makePlayers(n: number, preferences: Record<number, number[]> = {}): DrawPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, preferences: preferences[i + 1] ?? [] }));
}

describe('planPreferenceDraw — basic shape', () => {
  it('assigns floor(teams/players) teams to each player', () => {
    const teams = buildField();
    const players = makePlayers(7);
    const { assignments, teamsPerPlayer, leftover } = planPreferenceDraw({ teams, players, rng: mulberry32(1) });
    expect(teamsPerPlayer).toBe(6);
    expect(leftover).toBe(6);
    const owned = new Map<number, number>();
    for (const a of assignments) if (a.userId != null) owned.set(a.userId, (owned.get(a.userId) ?? 0) + 1);
    expect([...owned.values()]).toEqual(new Array(7).fill(6));
  });

  it('every team is assigned exactly once', () => {
    const { assignments } = planPreferenceDraw({ teams: buildField(), players: makePlayers(7), rng: mulberry32(1) });
    expect(new Set(assignments.map((a) => a.teamId)).size).toBe(48);
  });

  it('is deterministic given the same seed', () => {
    const a = planPreferenceDraw({ teams: buildField(), players: makePlayers(7), rng: mulberry32(42) });
    const b = planPreferenceDraw({ teams: buildField(), players: makePlayers(7), rng: mulberry32(42) });
    expect(a.assignments).toEqual(b.assignments);
  });
});

describe('planPreferenceDraw — top seed guarantee', () => {
  it('gives every player exactly one team from the top-N (by Polymarket price)', () => {
    const teams = buildField();
    const players = makePlayers(7);
    const { assignments } = planPreferenceDraw({ teams, players, rng: mulberry32(1) });
    const topIds = new Set(teams.slice(0, 7).map((t) => t.id)); // top 7 by price
    const seedsPerPlayer = new Map<number, number>();
    for (const a of assignments) {
      if (a.userId != null && topIds.has(a.teamId)) {
        seedsPerPlayer.set(a.userId, (seedsPerPlayer.get(a.userId) ?? 0) + 1);
      }
    }
    expect([...seedsPerPlayer.values()]).toEqual(new Array(7).fill(1));
  });

  it('flags top-seed assignments with isTopSeed', () => {
    const teams = buildField();
    const players = makePlayers(7);
    const { assignments } = planPreferenceDraw({ teams, players, rng: mulberry32(1) });
    const topIds = new Set(teams.slice(0, 7).map((t) => t.id));
    for (const a of assignments) {
      if (a.userId == null) continue;
      expect(a.isTopSeed).toBe(topIds.has(a.teamId));
    }
  });
});

describe('planPreferenceDraw — preferences honored', () => {
  it("gives a player their top preference when it's an uncontested top seed", () => {
    const teams = buildField();
    const players = makePlayers(7, { 1: [3] }); // player 1 wants team 3 (a top seed)
    const { assignments } = planPreferenceDraw({ teams, players, rng: mulberry32(1) });
    expect(assignments.find((a) => a.teamId === 3)?.userId).toBe(1);
  });

  it("gives a player a preferred non-top team if it's still in the pool", () => {
    const teams = buildField();
    const players = makePlayers(7, { 3: [40] }); // 40 is mid/low
    const { assignments } = planPreferenceDraw({ teams, players, rng: mulberry32(1) });
    expect(assignments.find((a) => a.teamId === 40)?.userId).toBe(3);
  });

  it('breaks contested top-seed preferences predictably (first player listing it wins)', () => {
    const teams = buildField();
    const players = makePlayers(7, {
      1: [1, 2, 3],
      2: [1, 2, 3], // both want top 3 — player 1 should win team 1
    });
    const { assignments } = planPreferenceDraw({ teams, players, rng: mulberry32(99) });
    expect(assignments.find((a) => a.teamId === 1)?.userId).toBe(1);
    expect(assignments.find((a) => a.teamId === 2)?.userId).toBe(2);
  });
});

describe('planPreferenceDraw — odds balancing', () => {
  it('keeps total Polymarket odds across players within a tight band', () => {
    const teams = buildField();
    const players = makePlayers(7);
    const { perPlayerOdds } = planPreferenceDraw({ teams, players, rng: mulberry32(7) });
    const totals = Object.values(perPlayerOdds);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    // With a smooth odds gradient and 7 players, every player gets ~the same
    // total. Max should be no more than 50% bigger than min.
    expect(max).toBeLessThan(min * 1.5);
  });

  it('reports perPlayerOdds that sum to the total of assigned teams', () => {
    const teams = buildField();
    const players = makePlayers(7);
    const { perPlayerOdds, assignments } = planPreferenceDraw({ teams, players, rng: mulberry32(7) });
    const assignedSum = assignments
      .filter((a) => a.userId != null)
      .reduce((s, a) => s + Number(teams.find((t) => t.id === a.teamId)!.polymarketPrice), 0);
    const reportedSum = Object.values(perPlayerOdds).reduce((s, v) => s + v, 0);
    expect(reportedSum).toBeCloseTo(assignedSum, 5);
  });
});

describe('planPreferenceDraw — edge cases', () => {
  it('throws when there are no players', () => {
    expect(() => planPreferenceDraw({ teams: buildField(), players: [], rng: mulberry32(1) })).toThrow(/players/);
  });

  it('puts no team in the leftover pool when the math is even', () => {
    const teams = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, polymarketPrice: 0.5 - i * 0.05 }));
    const { leftover } = planPreferenceDraw({ teams, players: makePlayers(3), rng: mulberry32(1) });
    expect(leftover).toBe(0);
  });
});
