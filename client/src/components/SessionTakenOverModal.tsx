import { loginRedirectUrl } from "../lib/onboarding";
import { clearSessionTakenOver } from "../lib/sessionTakeover";

const DESK_TAKEOVER_MESSAGE =
  "You were signed out because AlertNav was opened on another device.";

/**
 * Full-screen, unclosable lockout when another device claimed the active session.
 * Blurs the desk so live data is no longer readable.
 */
export function SessionTakenOverModal() {
  const onLogBackIn = () => {
    clearSessionTakenOver();
    window.location.assign(loginRedirectUrl("/dashboard"));
  };

  return (
    <div className="session-takeover-overlay" role="alertdialog" aria-modal="true" aria-labelledby="session-takeover-title">
      <div className="session-takeover-card">
        <h2 id="session-takeover-title" className="session-takeover-title">
          {DESK_TAKEOVER_MESSAGE}
        </h2>
        <p className="session-takeover-body">
          Only one device can run the live desk at a time. Log back in here to reclaim this
          session — that will sign out the other device.
        </p>
        <button type="button" className="btn-primary session-takeover-primary" onClick={onLogBackIn}>
          Log back in here
        </button>
        <a href="/get-started" className="session-takeover-secondary">
          Need multiple dispatchers? Add a seat to your plan
        </a>
      </div>
    </div>
  );
}
