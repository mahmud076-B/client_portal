import { describe, expect, it } from 'vitest';
import { isRevealed } from '@/lib/ui/reveal';

const VH = 900;
const entry = (height: number, visibleHeight: number) => ({
  isIntersecting: visibleHeight > 0,
  intersectionRatio: visibleHeight / height,
  visibleHeight,
  height,
});

describe('scroll reveal', () => {
  it('reveals the /admin/meta accounts box (thousands of px tall) as soon as it is on screen', () => {
    // 51 campaigns ≈ 5,500px; ~400px visible under the connection card = 7% < 8%.
    expect(isRevealed(entry(5500, 400), VH)).toBe(true);
    expect(isRevealed(entry(14000, 30), VH)).toBe(true);
  });
  it('normal cards still wait until a meaningful part is visible', () => {
    expect(isRevealed(entry(300, 10), VH)).toBe(false);
    expect(isRevealed(entry(300, 30), VH)).toBe(true); // 10%
    expect(isRevealed(entry(800, 130), VH)).toBe(true); // ≥120px visible
  });
  it('never reveals off-screen elements', () => {
    expect(isRevealed(entry(14000, 0), VH)).toBe(false);
  });
});
