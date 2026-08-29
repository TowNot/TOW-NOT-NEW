import { useUser } from "@clerk/clerk-react";
import { AcceptableUsePage } from "./pages/AcceptableUsePage";
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
  "/acceptable-use",
]);

function LegalRoute({ path }: { path: string }) {
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/refund-policy") return <RefundPolicyPage />;
  if (path === "/disclaimer") return <DisclaimerPage />;
  if (path === "/acceptable-use") return <AcceptableUsePage />;
  return null;
}

export default function App() {
  if (!isClerkConfigured()) {
    return <AppShell isSignedIn={false} user={null} />;
  }
  return <ClerkAwareApp />;
}

function ClerkAwareApp() {
  const { isLoaded, isSignedIn, user } = useUser();
  // Never block the desk on Clerk handshake — show signed-out until auth resolves.
  return (
    <AppShell
      isSignedIn={isLoaded ? Boolean(isSignedIn) : false}
      user={isLoaded ? (user ?? null) : null}
    />
  );
}

function AppShell({
  isSignedIn,
  user,
}: {
  isSignedIn: boolean;
  user: ZoneUser | null;
}) {
  const path = currentPath();

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
