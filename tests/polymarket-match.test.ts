import { describe, it, expect } from 'vitest';
import { matchPolymarketName } from '@/lib/polymarket-match';

const TEAMS = [
  { id: 1, code: 'USA', name: 'United States' },
  { id: 2, code: 'KOR', name: 'South Korea' },
  { id: 3, code: 'TUR', name: 'Türkiye' },
  { id: 4, code: 'CIV', name: "Côte d'Ivoire" },
  { id: 5, code: 'FRA', name: 'France' },
  { id: 6, code: 'COD', name: 'DR Congo' },
];

describe('matchPolymarketName', () => {
  it('matches an exact name', () => {
    expect(matchPolymarketName('France', TEAMS)?.id).toBe(5);
  });

  it('ignores case differences', () => {
    expect(matchPolymarketName('FRANCE', TEAMS)?.id).toBe(5);
  });

  it('matches "United States" to USA team', () => {
    expect(matchPolymarketName('United States', TEAMS)?.id).toBe(1);
  });

  it('matches "USA" alias to United States', () => {
    expect(matchPolymarketName('USA', TEAMS)?.id).toBe(1);
  });

  it('matches "South Korea" / "Korea Republic"', () => {
    expect(matchPolymarketName('South Korea', TEAMS)?.id).toBe(2);
    expect(matchPolymarketName('Korea Republic', TEAMS)?.id).toBe(2);
  });

  it('strips diacritics to match "Turkey" → "Türkiye"', () => {
    expect(matchPolymarketName('Turkey', TEAMS)?.id).toBe(3);
    expect(matchPolymarketName('Turkiye', TEAMS)?.id).toBe(3);
  });

  it('strips diacritics to match "Cote d\'Ivoire" → "Côte d\'Ivoire"', () => {
    expect(matchPolymarketName("Cote d'Ivoire", TEAMS)?.id).toBe(4);
    expect(matchPolymarketName('Ivory Coast', TEAMS)?.id).toBe(4);
  });

  it('matches "Democratic Republic of the Congo" to DR Congo', () => {
    expect(matchPolymarketName('DR Congo', TEAMS)?.id).toBe(6);
    expect(matchPolymarketName('Democratic Republic of the Congo', TEAMS)?.id).toBe(6);
  });

  it('returns null when no team matches', () => {
    expect(matchPolymarketName('Atlantis', TEAMS)).toBeNull();
  });
});
