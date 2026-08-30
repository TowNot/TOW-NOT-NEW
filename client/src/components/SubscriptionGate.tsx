import { useUser } from "@clerk/clerk-react";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { resolveHasZonePreference, type ZoneUser } from "../hooks/useSelectedZone";
import { isClerkConfigured } from "../lib/clerkKey";

function redirect(to: string): null {
  window.location.replace(to);
  return null;
}

/** Block desk until the user is signed in, subscribed, and has a saved zone. */
export function ProtectedDeskRoute({ user }: { user: ZoneUser | null }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading) {
    return null;
  }

  if (!isSignedIn) {
    return redirect("/get-started");
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  if (!resolveHasZonePreference(user)) {
    return redirect("/welcome");
  }

  return <IncidentDesk user={user} />;
}

/** Post-login zone picker — only for subscribed users without a saved city. */
export function ProtectedWelcomeRoute({ user }: { user: ZoneUser | null }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading) {
    return null;
  }

  if (!isSignedIn) {
    return redirect("/get-started");
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  if (resolveHasZonePreference(user)) {
    return redirect("/dashboard");
  }

  return <SelectZonePage user={user} />;
}
