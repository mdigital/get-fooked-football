/**
 * Pure presentation helper for the match-page curse speech bubbles.
 *
 * Each bubble gets a subtle, slightly-random rotation and scale so the wall of
 * hexes looks hand-stuck rather than a tidy grid. We derive it deterministically
 * from the curse's identity (userId + teamId) so a bubble keeps the same jaunty
 * angle across reloads instead of jumping around on every render.
 */

/** Mix two ints into a well-spread unsigned 32-bit hash. */
function mix(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Map a hash to a float in [0, 1). */
function unit(h: number): number {
  return (h >>> 0) / 4294967296;
}

export type BubbleTransform = { angleDeg: number; scale: number };

/**
 * Deterministic subtle transform for a curse bubble.
 * Rotation lands in roughly ±4°, scale in roughly 0.94..1.06.
 */
export function bubbleTransform(userId: number, teamId: number): BubbleTransform {
  const h = mix(userId, teamId);
  // Two independent-ish streams from the one hash.
  const a = unit(h);
  const b = unit(Math.imul(h ^ 0x9e3779b9, 2246822519));

  const angleDeg = Math.round((a * 8 - 4) * 100) / 100; // -4..+4
  const scale = Math.round((0.94 + b * 0.12) * 1000) / 1000; // 0.94..1.06
  return { angleDeg, scale };
}
