import { useUser } from "@clerk/clerk-react";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { IncidentDesk } from "./pages/IncidentDesk";
import { LandingPage } from "./pages/LandingPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RefundPolicyPage } from "./pages/RefundPolicyPage";
import { SelectZonePage } from "./pages/SelectZonePage";
import { TermsPage } from "./pages/TermsPage";
import { isClerkConfigured } from "./lib/clerkKey";
import { resolveSelectedZoneId, type ZoneUser } from "./hooks/useSelectedZone";

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

const LEGAL_PATHS = new Set([
  "/privacy",
  "/terms",
  "/refund-policy",
  "/disclaimer",
]);

function LegalRoute({ path }: { path: string }) {
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/refund-policy") return <RefundPolicyPage />;
  if (path === "/disclaimer") return <DisclaimerPage />;
  return null;
}

export default function App() {
  if (!isClerkConfigured()) {
    return <AppShell isLoaded isSignedIn={false} user={null} />;
  }
  return <ClerkAwareApp />;
}

function ClerkAwareApp() {
  const { isLoaded, isSignedIn, user } = useUser();
  return <AppShell isLoaded={isLoaded} isSignedIn={Boolean(isSignedIn)} user={user ?? null} />;
}

function AppShell({
  isLoaded,
  isSignedIn,
  user,
}: {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: ZoneUser | null;
}) {
  const path = currentPath();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  const zoneId = resolveSelectedZoneId(user);
  const onWelcome = path === "/welcome" || path === "/select-zone";
  const onLegal = LEGAL_PATHS.has(path);

  if (onLegal) {
    return <LegalRoute path={path} />;
  }

  if (isSignedIn && !zoneId && path !== "/" && !onWelcome) {
    window.location.replace("/welcome");
    return null;
  }

  if (isSignedIn && zoneId && onWelcome) {
    window.location.replace("/dashboard");
    return null;
  }

  if (path === "/") return <LandingPage />;
  if (onWelcome) return <SelectZonePage user={user} />;
  return <IncidentDesk user={user} />;
}
