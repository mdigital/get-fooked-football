import { describe, it, expect } from 'vitest';
import { bubbleTransform } from '@/lib/curses';

describe('bubbleTransform', () => {
  it('is deterministic for the same curse identity', () => {
    expect(bubbleTransform(3, 17)).toEqual(bubbleTransform(3, 17));
  });

  it('keeps the rotation subtle (within ±5°)', () => {
    for (let u = 1; u <= 20; u++) {
      for (let t = 1; t <= 20; t++) {
        const { angleDeg } = bubbleTransform(u, t);
        expect(angleDeg).toBeGreaterThanOrEqual(-5);
        expect(angleDeg).toBeLessThanOrEqual(5);
      }
    }
  });

  it('keeps the scale subtle (0.9..1.1)', () => {
    for (let u = 1; u <= 20; u++) {
      for (let t = 1; t <= 20; t++) {
        const { scale } = bubbleTransform(u, t);
        expect(scale).toBeGreaterThanOrEqual(0.9);
        expect(scale).toBeLessThanOrEqual(1.1);
      }
    }
  });

  it('varies across different curses (not all identical)', () => {
    const angles = new Set<number>();
    const scales = new Set<number>();
    for (let t = 1; t <= 30; t++) {
      const { angleDeg, scale } = bubbleTransform(7, t);
      angles.add(angleDeg);
      scales.add(scale);
    }
    // A decent spread — not every bubble lands on the same value.
    expect(angles.size).toBeGreaterThan(5);
    expect(scales.size).toBeGreaterThan(5);
  });

  it('swapping userId/teamId generally changes the result', () => {
    expect(bubbleTransform(3, 17)).not.toEqual(bubbleTransform(17, 3));
  });
});
