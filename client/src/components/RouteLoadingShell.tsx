/** Full-viewport loading state while auth or subscription checks finish. */
export function RouteLoadingShell({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="route-loading-shell page-shell" role="status" aria-live="polite" aria-busy="true">
      <div className="route-loading-shell-inner">
        <div className="route-loading-spinner" aria-hidden />
        <p className="route-loading-label">{label}</p>
      </div>
    </div>
  );
}
