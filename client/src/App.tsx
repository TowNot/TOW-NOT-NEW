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
import { canAccessDesk } from "./lib/adminAccess";
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
    return <AppShell isSignedIn={false} user={null} userEmail={null} />;
  }
  return <ClerkAwareApp />;
}

function ClerkAwareApp() {
  const { isLoaded, isSignedIn, user } = useUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  return (
    <AppShell
      isSignedIn={isLoaded ? Boolean(isSignedIn) : false}
      user={isLoaded ? (user ?? null) : null}
      userEmail={email}
    />
  );
}

function AppShell({
  isSignedIn,
  user,
  userEmail,
}: {
  isSignedIn: boolean;
  user: ZoneUser | null;
  userEmail: string | null;
}) {
  const appPath = currentPath();
  const isAdmin = canAccessDesk(userEmail);

  const zoneId = resolveSelectedZoneId(user);
  const onWelcome = appPath === "/welcome" || appPath === "/select-zone";
  const onLegal = LEGAL_PATHS.has(appPath);
  const onGetStarted = appPath === "/get-started";
  const onHome = appPath === "/";
  const onDesk = appPath === "/dashboard" || appPath === "/desk";

  if (isRetiredPreviewPath(appPath)) {
    window.location.replace("/");
    return null;
  }

  if (onLegal) {
    return <LegalRoute path={appPath} />;
  }

  if (onGetStarted) return <GetStartedPage user={user} />;

  if (onHome) {
    return <LandingPage isSignedIn={isSignedIn} />;
  }

  if (onDesk && !isAdmin) {
    window.location.replace(isSignedIn ? "/get-started" : "/");
    return null;
  }

  if (isSignedIn && !zoneId && !onWelcome && isAdmin && onDesk) {
    window.location.replace("/welcome");
    return null;
  }

  if (isSignedIn && zoneId && onWelcome && isAdmin) {
    window.location.replace("/dashboard");
    return null;
  }

  if (onWelcome) return <SelectZonePage user={user} />;

  if (onDesk) {
    return <IncidentDesk user={user} />;
  }

  window.location.replace("/");
  return null;
}
