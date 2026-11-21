'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Glass modal rendered into document.body. Portaling matters: glass cards use
 * backdrop-filter and reveal transforms, both of which would otherwise trap a
 * position:fixed overlay inside the card.
 */
const noopSubscribe = () => () => {};

export default function Modal({
  onClose,
  labelledBy,
  maxWidth = 480,
  children,
}: {
  onClose: () => void;
  labelledBy?: string;
  maxWidth?: number;
  children: ReactNode;
}) {
  // false during SSR/hydration, true on the client: portal only after mount.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className="gx-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gx-card gx-modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ maxWidth, textAlign: 'left' }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
