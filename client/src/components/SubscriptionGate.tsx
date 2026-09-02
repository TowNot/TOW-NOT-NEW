import { useUser } from "@clerk/clerk-react";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { isClerkConfigured } from "../lib/clerkKey";
import { loginRedirectUrl } from "../lib/onboarding";

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

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl(currentReturnPath()));
  }

  return <IncidentDesk user={user} />;
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
