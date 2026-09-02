import { useUser } from "@clerk/clerk-react";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { SessionTakenOverModal } from "./SessionTakenOverModal";
import { isClerkConfigured } from "../lib/clerkKey";
import { loginRedirectUrl } from "../lib/onboarding";
import { useSessionTakeover } from "../lib/sessionTakeover";

function redirect(to: string): null {
  window.location.replace(to);
  return null;
}

function currentReturnPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/login" ? "/dashboard" : path;
}

/** Block desk until the user is signed in. Subscription is enforced on APIs + in-desk banner. */
export function ProtectedDeskRoute({ user }: { user: Parameters<typeof IncidentDesk>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();
  const sessionTakenOver = useSessionTakeover();

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl(currentReturnPath()));
  }

  return (
    <div className={sessionTakenOver ? "session-takeover-desk" : undefined}>
      <IncidentDesk user={user} />
      {sessionTakenOver ? <SessionTakenOverModal /> : null}
    </div>
  );
}

/** Zone picker for signed-in users who want to change city. */
export function ProtectedWelcomeRoute({ user }: { user: Parameters<typeof SelectZonePage>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl("/welcome"));
  }

  return <SelectZonePage user={user} />;
}
