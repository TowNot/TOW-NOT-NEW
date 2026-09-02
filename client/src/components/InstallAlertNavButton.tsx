/** Progressier PWA install — use class `progressier-install-button` on a button. */
export function InstallAlertNavButton({
  className = "btn-outline-cobalt btn-cta-pair px-5 py-2.5 text-sm",
}: {
  className?: string;
}) {
  return (
    <button type="button" className={`progressier-install-button ${className}`}>
      Install AlertNav
    </button>
  );
}

export const INSTALL_APP_HINT =
  "Removed the app from your phone? Install again anytime. Open it and sign in to pick up where you left off.";
