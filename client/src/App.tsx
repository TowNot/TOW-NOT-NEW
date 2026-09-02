import { useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { AcceptableUsePage } from "./pages/AcceptableUsePage";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { GetStartedPage } from "./pages/GetStartedPage";
import { LandingPage } from "./pages/LandingPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RefundPolicyPage } from "./pages/RefundPolicyPage";
import { TermsPage } from "./pages/TermsPage";
import { ProtectedDeskRoute, ProtectedWelcomeRoute } from "./components/SubscriptionGate";
import { useDeviceSessionTakeover } from "./hooks/useDeviceSessionTakeover";
import { isClerkConfigured } from "./lib/clerkKey";
import { signInUrl } from "./lib/onboarding";
import { isProtectedDeskPath, isProtectedOnboardingPath } from "./lib/protectedRoutes";
import { type ZoneUser } from "./hooks/useSelectedZone";

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
  useDeviceSessionTakeover();
  return (
    <AppShell
      isSignedIn={isLoaded ? Boolean(isSignedIn) : false}
      user={isLoaded ? (user ?? null) : null}
    />
  );
}

function usePageTheme(path: string) {
  useEffect(() => {
    const isAurora = path === "/" || path === "/get-started";
    document.documentElement.classList.toggle("theme-aurora", isAurora);
  }, [path]);
}

function AppShell({
  isSignedIn,
  user,
}: {
  isSignedIn: boolean;
  user: ZoneUser | null;
}) {
  const path = currentPath();
  usePageTheme(path);

  const onWelcome = isProtectedOnboardingPath(path);
  const onLegal = LEGAL_PATHS.has(path);
  const onGetStarted = path === "/get-started";
  const onDesk = isProtectedDeskPath(path);

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

  if (path === "/login") {
    const params = new URLSearchParams(window.location.search);
    const returnPath = params.get("return") || "/dashboard";
    window.location.replace(signInUrl(returnPath));
    return null;
  }

  if (path === "/") {
    return <LandingPage isSignedIn={isSignedIn} />;
  }

  if (onDesk) {
    return <ProtectedDeskRoute user={user} />;
  }

  if (onWelcome) {
    return <ProtectedWelcomeRoute user={user} />;
  }

  window.location.replace("/");
  return null;
}
