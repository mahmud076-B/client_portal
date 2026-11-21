'use client';

import { useEffect } from 'react';

/**
 * Site-wide scroll choreography. Any element matching REVEAL_SELECTOR floats
 * up and fades in as it enters the viewport, and floats away and fades out as
 * it leaves (upwards if it scrolled off the top, downwards otherwise).
 * Works for server-rendered markup and legacy `.fade-up` blocks without any
 * per-page wiring; new nodes are picked up through a MutationObserver.
 */
const REVEAL_SELECTOR = [
  '[data-reveal]',
  '.gx-card',
  '.fade-up',
  '.kpi-card',
  '.chart-card',
  '.status-card',
  '.activity-card',
  '.campaign-bar',
  '.mk-lu',
  '.gx-admin .rounded-2xl',
].join(',');

const SKIP_INSIDE = '.sidebar, .gx-modal-backdrop, [data-reveal="off"]';
const STAGGER_MS = 70;
const MAX_STAGGER_STEPS = 6;

export default function MotionProvider() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.classList.remove('gx-motion');
    if (reduced || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        let step = 0;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            el.style.setProperty('--rv-delay', `${Math.min(step++, MAX_STAGGER_STEPS) * STAGGER_MS}ms`);
            el.dataset.rv = 'in';
          } else {
            el.style.setProperty('--rv-delay', '0ms');
            el.dataset.rvDir = entry.boundingClientRect.top < 0 ? 'up' : 'down';
            el.dataset.rv = 'out';
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
    );

    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.closest(SKIP_INSIDE)) return;
        // Only animate the outermost box; nested cards ride along with their parent.
        if (el.parentElement?.closest('[data-rv]')) return;
        el.dataset.rvDir = 'down';
        el.dataset.rv = 'out';
        io.observe(el);
      });
    };

    scan();
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return null;
}
