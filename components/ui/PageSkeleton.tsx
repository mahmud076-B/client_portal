/** Instant placeholder shown by route-level loading.tsx while the server renders. */
export default function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="gx-skel-page" role="status" aria-live="polite" aria-label="Loading">
      <div className="gx-skel" style={{ height: 56, maxWidth: 420 }} />
      <div className="gx-skel-row">
        {Array.from({ length: kpis }, (_, i) => <div key={i} className="gx-skel" style={{ height: 112 }} />)}
      </div>
      <div className="gx-skel" style={{ height: 300 }} />
    </div>
  );
}
