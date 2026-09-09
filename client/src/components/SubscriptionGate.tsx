import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { RouteLoadingShell } from "./RouteLoadingShell";
import { SessionTakenOverModal } from "./SessionTakenOverModal";
import { isClerkConfigured } from "../lib/clerkKey";
import { apiFetch, SessionReplacedError } from "../lib/apiFetch";
import { loginRedirectUrl } from "../lib/onboarding";
import { useSessionTakeover } from "../lib/sessionTakeover";
import {
  isZoneEnabledForDesk,
  isZoneId,
  readLocalCityChosen,
  readLocalZoneId,
  writeLocalCityChosen,
  writeLocalZoneId,
} from "../lib/zones";
import type { ZoneUser } from "../hooks/useSelectedZone";

function redirect(to: string): null {
  window.location.replace(to);
  return null;
}

function currentReturnPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/login" ? "/dashboard" : path;
}

function metadataHasChosenCity(user: ZoneUser | null | undefined): boolean {
  if (!user) return false;
  const fromPublic = user.publicMetadata?.selectedZoneId;
  if (isZoneId(fromPublic) && isZoneEnabledForDesk(fromPublic)) return true;
  const fromUnsafe = user.unsafeMetadata?.selectedZoneId;
  return isZoneId(fromUnsafe) && isZoneEnabledForDesk(fromUnsafe);
}

/** Client-side evidence the user already picked a city (survives flaky city API). */
function clientHasChosenCity(user: ZoneUser | null | undefined): boolean {
  if (readLocalCityChosen()) {
    const local = readLocalZoneId();
    if (local && isZoneEnabledForDesk(local)) return true;
  }
  return metadataHasChosenCity(user);
}

function useCityChosen(
  enabled: boolean,
  user: ZoneUser | null | undefined,
): { cityChosen: boolean | null; loading: boolean } {
  const [cityChosen, setCityChosen] = useState<boolean | null>(null);
  /** idle/loading/done — must not treat "not yet fetched" as cityChosen=false. */
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    if (!enabled) {
      setCityChosen(null);
      setFetchState("idle");
      return;
    }
    let cancelled = false;
    setFetchState("loading");
    void apiFetch("/api/user/city")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.cityChosen === true) {
          const city = data?.selectedCity;
          if (isZoneId(city) && isZoneEnabledForDesk(city)) {
            writeLocalZoneId(city);
          }
          writeLocalCityChosen(true);
          setCityChosen(true);
          return;
        }
        // API said unchosen or returned nothing — keep desk open if we already picked locally.
        setCityChosen(clientHasChosenCity(user));
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof SessionReplacedError) {
          // Session takeover UI handles this — do not bounce to city picker.
          setCityChosen(clientHasChosenCity(user));
          return;
        }
        setCityChosen(clientHasChosenCity(user));
      })
      .finally(() => {
        if (!cancelled) setFetchState("done");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, user?.id]);

  // When enabled flips true, fetchState is still "idle" until this effect runs —
  // keep loading so we never redirect on a null cityChosen from the prior disabled state.
  const loading = enabled && fetchState !== "done";
  return { cityChosen, loading };
}

/** Block desk until signed in with an active or trialing subscription. */
export function ProtectedDeskRoute({ user }: { user: Parameters<typeof IncidentDesk>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading, refresh } = useSubscriptionStatus();
  const sessionTakenOver = useSessionTakeover();
  const { cityChosen, loading: cityLoading } = useCityChosen(
    Boolean(isSignedIn && subscribed),
    user,
  );

  useEffect(() => {
    if (!isSignedIn) return;
    // Quiet recheck — never set loading, or the desk unmounts every minute.
    const timer = window.setInterval(() => void refresh({ background: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [isSignedIn, refresh]);

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading || (subscribed && cityLoading)) {
    return <RouteLoadingShell label="Checking your access…" />;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl(currentReturnPath()));
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  // Only bounce after the city fetch finishes — null means still unknown.
  if (cityChosen !== true) {
    return redirect("/welcome");
  }

  return (
    <div className={sessionTakenOver ? "session-takeover-desk" : undefined}>
      <IncidentDesk user={user} />
      {sessionTakenOver ? <SessionTakenOverModal /> : null}
    </div>
  );
}

/** Zone picker — subscribed accounts only (canceled → billing). */
export function ProtectedWelcomeRoute({ user }: { user: Parameters<typeof SelectZonePage>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();
  const { cityChosen, loading: cityLoading } = useCityChosen(
    Boolean(isSignedIn && subscribed),
    user,
  );

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading || (subscribed && cityLoading)) {
    return <RouteLoadingShell label="Checking your access…" />;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl("/welcome"));
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  // Already picked — don't show the chooser again on every app open.
  if (cityChosen === true) {
    return redirect("/dashboard");
  }

  return <SelectZonePage user={user} />;
}
