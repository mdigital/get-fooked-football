import { describe, expect, it } from 'vitest';
import { fifaThirdPlaceFills } from '@/lib/bracket';

// group letter -> a stand-in team id
const ID: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10, K: 11, L: 12 };

/** The realized 2026 combination: best thirds from B,D,E,F,I,J,K,L. */
const QUALIFIED = ['B', 'D', 'E', 'F', 'I', 'J', 'K', 'L'].map((g) => ({ teamId: ID[g], group: g }));

/** The eight R32 winner slots that face a third, with their winner group. */
const SLOTS = [
  { fixtureId: 183, side: 'away' as const, label: '3rd: C/E/F/H/I', winnerGroup: 'A' }, // Mexico 1A
  { fixtureId: 189, side: 'away' as const, label: '3rd: E/F/G/I/J', winnerGroup: 'B' }, // Switzerland 1B
  { fixtureId: 186, side: 'away' as const, label: '3rd: B/E/F/I/J', winnerGroup: 'D' }, // USA 1D
  { fixtureId: 179, side: 'away' as const, label: '3rd: A/B/C/D/F', winnerGroup: 'E' }, // Germany 1E
  { fixtureId: 185, side: 'away' as const, label: '3rd: A/E/H/I/J', winnerGroup: 'G' }, // Belgium 1G
  { fixtureId: 182, side: 'away' as const, label: '3rd: C/D/F/G/H', winnerGroup: 'I' }, // France 1I
  { fixtureId: 192, side: 'away' as const, label: '3rd: D/E/I/J/L', winnerGroup: 'K' }, // Colombia 1K
  { fixtureId: 184, side: 'away' as const, label: '3rd: E/H/I/J/K', winnerGroup: 'L' }, // England 1L
];

describe('fifaThirdPlaceFills', () => {
  it('assigns Germany (1E) the third from group D — Paraguay — per FIFA Annex C', () => {
    const fills = fifaThirdPlaceFills({ qualifiedThirds: QUALIFIED, slots: SLOTS })!;
    expect(fills).not.toBeNull();
    const germany = fills.find((f) => f.fixtureId === 179)!;
    expect(germany.teamId).toBe(ID.D); // 3D = Paraguay
  });

  it('resolves the whole realized combination as a bijection', () => {
    const fills = fifaThirdPlaceFills({ qualifiedThirds: QUALIFIED, slots: SLOTS })!;
    const byFixture = new Map(fills.map((f) => [f.fixtureId, f.teamId]));
    expect(byFixture.get(183)).toBe(ID.E); // 1A -> 3E
    expect(byFixture.get(189)).toBe(ID.J); // 1B -> 3J
    expect(byFixture.get(186)).toBe(ID.B); // 1D -> 3B
    expect(byFixture.get(179)).toBe(ID.D); // 1E -> 3D
    expect(byFixture.get(185)).toBe(ID.I); // 1G -> 3I
    expect(byFixture.get(182)).toBe(ID.F); // 1I -> 3F
    expect(byFixture.get(192)).toBe(ID.L); // 1K -> 3L
    expect(byFixture.get(184)).toBe(ID.K); // 1L -> 3K
    // Every qualified third placed exactly once.
    expect(new Set(fills.map((f) => f.teamId)).size).toBe(8);
    expect(fills.map((f) => f.teamId).sort((a, b) => a - b)).toEqual(QUALIFIED.map((q) => q.teamId).sort((a, b) => a - b));
  });

  it('respects the third group assigned to the slot, not just the slot label options', () => {
    // Germany's slot label allows {A,B,C,D,F}; the table picks D specifically.
    const fills = fifaThirdPlaceFills({ qualifiedThirds: QUALIFIED, slots: SLOTS })!;
    expect(fills.find((f) => f.fixtureId === 179)!.teamId).toBe(ID.D);
  });

  it('returns null for a combination not in the table (caller falls back to manual)', () => {
    const otherCombo = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((g) => ({ teamId: ID[g], group: g }));
    expect(fifaThirdPlaceFills({ qualifiedThirds: otherCombo, slots: SLOTS })).toBeNull();
  });

  it('returns null if a slot winner group is unknown so the caller can fall back', () => {
    const slots = SLOTS.map((s) => (s.fixtureId === 179 ? { ...s, winnerGroup: null } : s));
    expect(fifaThirdPlaceFills({ qualifiedThirds: QUALIFIED, slots })).toBeNull();
  });
});
