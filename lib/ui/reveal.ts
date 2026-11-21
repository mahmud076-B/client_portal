/**
 * Scroll-reveal decision for MotionProvider. Pure (unit-tested).
 *
 * Elements start hidden (opacity 0) and are revealed when they enter the viewport.
 * A fixed visibility ratio (8%) can never be reached by a box taller than
 * viewport / 0.08 (~10,000px on a laptop), and is not reached at page load by a
 * box of a few thousand pixels sitting under a header card. That kept the whole
 * /admin/meta "Ad Accounts Directory" (51+ campaigns) at opacity 0: a blank page.
 * Rule: a box is in view when 8% of it is visible, OR when it covers a real part
 * of the screen, OR when it is taller than the viewport and intersects at all.
 */
export const REVEAL_RATIO = 0.08;
export const REVEAL_MIN_VISIBLE_PX = 120;
export const REVEAL_THRESHOLDS = [0, 0.01, REVEAL_RATIO];

export interface RevealEntry {
  isIntersecting: boolean;
  intersectionRatio: number;
  /** Visible height in px (IntersectionObserverEntry.intersectionRect.height). */
  visibleHeight: number;
  /** Element height in px (boundingClientRect.height). */
  height: number;
}

export function isRevealed(e: RevealEntry, viewportHeight: number): boolean {
  if (!e.isIntersecting) return false;
  if (e.height > viewportHeight) return true;
  if (e.intersectionRatio >= REVEAL_RATIO) return true;
  return e.visibleHeight >= Math.min(REVEAL_MIN_VISIBLE_PX, viewportHeight * 0.15);
}
