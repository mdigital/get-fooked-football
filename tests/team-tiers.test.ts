import { describe, it, expect } from 'vitest';
import { buildTeamTiers } from '@/lib/team-tiers';

function team(id: number, fifaRank: number, polymarketPrice: number | string = 0) {
  return { id, fifaRank, polymarketPrice };
}

describe('buildTeamTiers', () => {
  it('sorts by FIFA rank ascending when no Polymarket prices are set', () => {
    const teams = [
      team(1, 50),
      team(2, 1),
      team(3, 100),
      team(4, 10),
    ];
    const out = buildTeamTiers(teams);
    expect(out.havePrices).toBe(false);
    expect(out.ranked.map((t) => t.id)).toEqual([2, 4, 1, 3]);
  });

  it('sorts by Polymarket price (high-first) when any team has a non-zero price', () => {
    const teams = [
      team(1, 50, 0.12),
      team(2, 1, 0), // top FIFA but no price
      team(3, 100, 0.40),
      team(4, 10, 0.05),
    ];
    const out = buildTeamTiers(teams);
    expect(out.havePrices).toBe(true);
    expect(out.ranked.map((t) => t.id)).toEqual([3, 1, 4, 2]);
  });

  it('treats numeric-string polymarketPrice (Drizzle numeric) the same as number', () => {
    const teams = [team(1, 50, '0.05'), team(2, 1, '0.20')];
    const out = buildTeamTiers(teams);
    expect(out.havePrices).toBe(true);
    expect(out.ranked.map((t) => t.id)).toEqual([2, 1]);
  });

  it('puts the strongest 8 in favourites, next 16 in midtable, rest in underdogs', () => {
    const teams = Array.from({ length: 48 }, (_, i) => team(i + 1, i + 1));
    const out = buildTeamTiers(teams);
    expect(out.favourites).toHaveLength(8);
    expect(out.midtable).toHaveLength(16);
    expect(out.underdogs).toHaveLength(48 - 24);
    // Top 8 in favourites should be the 8 best FIFA ranks (1..8).
    expect(out.favourites.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('handles fewer than 24 teams without crashing', () => {
    const teams = [team(1, 1), team(2, 2)];
    const out = buildTeamTiers(teams);
    expect(out.favourites.map((t) => t.id)).toEqual([1, 2]);
    expect(out.midtable).toEqual([]);
    expect(out.underdogs).toEqual([]);
  });
});
