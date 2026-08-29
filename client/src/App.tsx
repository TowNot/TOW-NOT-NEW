import { useUser } from "@clerk/clerk-react";
import { AcceptableUsePage } from "./pages/AcceptableUsePage";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { GetStartedPage } from "./pages/GetStartedPage";
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

/** Retired design-preview URLs — send visitors to the live app. */
function isRetiredPreviewPath(path: string): boolean {
  return (
    path === "/design-preview" ||
    path === "/designs" ||
    path === "/option-1" ||
    path.startsWith("/option-1/") ||
    path === "/option-2" ||
    path.startsWith("/option-2/") ||
    path === "/option-3" ||
    path.startsWith("/option-3/") ||
    path === "/option-4" ||
    path.startsWith("/option-4/") ||
    path === "/option-5" ||
    path.startsWith("/option-5/") ||
    path === "/option-6" ||
    path.startsWith("/option-6/")
  );
}

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
  const onGetStarted = path === "/get-started";
  const onDesk = path === "/dashboard" || path === "/desk";

  if (isRetiredPreviewPath(path)) {
    window.location.replace("/");
    return null;
  }

  if (onLegal) {
    return <LegalRoute path={path} />;
  }

  if (onGetStarted) {
    return <GetStartedPage user={user} />;
  }

  if (path === "/") {
    return <LandingPage isSignedIn={isSignedIn} />;
  }

  if (onDesk && !isSignedIn) {
    window.location.replace("/get-started");
    return null;
  }

  if (isSignedIn && !zoneId && onDesk) {
    window.location.replace("/welcome");
    return null;
  }

  if (isSignedIn && zoneId && onWelcome) {
    window.location.replace("/dashboard");
    return null;
  }

  if (onWelcome) return <SelectZonePage user={user} />;

  return <IncidentDesk user={user} />;
}
