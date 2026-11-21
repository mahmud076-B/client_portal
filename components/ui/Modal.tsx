'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Glass modal rendered into document.body. Portaling matters: glass cards use
 * backdrop-filter and reveal transforms, both of which would otherwise trap a
 * position:fixed overlay inside the card.
 */
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
