import { useUser } from "@clerk/clerk-react";
import { AcceptableUsePage } from "./pages/AcceptableUsePage";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { DesignHubPage } from "./pages/DesignHubPage";
import { GetStartedPage } from "./pages/GetStartedPage";
import { IncidentDesk } from "./pages/IncidentDesk";
import { LandingPage } from "./pages/LandingPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RefundPolicyPage } from "./pages/RefundPolicyPage";
import { SelectZonePage } from "./pages/SelectZonePage";
import { TermsPage } from "./pages/TermsPage";
import { Option2IncidentDesk } from "./pages/option2/Option2IncidentDesk";
import { Option2LandingPage } from "./pages/option2/Option2LandingPage";
import { Option3IncidentDesk } from "./pages/option3/Option3IncidentDesk";
import { Option3LandingPage } from "./pages/option3/Option3LandingPage";
import { Option4IncidentDesk } from "./pages/option4/Option4IncidentDesk";
import { Option4LandingPage } from "./pages/option4/Option4LandingPage";
import { Option5IncidentDesk } from "./pages/option5/Option5IncidentDesk";
import { Option5LandingPage } from "./pages/option5/Option5LandingPage";
import { Option6IncidentDesk } from "./pages/option6/Option6IncidentDesk";
import { Option6LandingPage } from "./pages/option6/Option6LandingPage";
import {
  DESIGN_HUB_PATH,
  parseDesignPath,
  type DesignVariant,
  variantPublicDesk,
  variantPublicHome,
} from "./design/designRoutes";
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

function renderHome(variant: DesignVariant, isSignedIn: boolean) {
  if (variant === "option2") return <Option2LandingPage isSignedIn={isSignedIn} />;
  if (variant === "option3") return <Option3LandingPage isSignedIn={isSignedIn} />;
  if (variant === "option4") return <Option4LandingPage isSignedIn={isSignedIn} />;
  if (variant === "option5") return <Option5LandingPage isSignedIn={isSignedIn} />;
  if (variant === "option6") return <Option6LandingPage isSignedIn={isSignedIn} />;
  return <LandingPage isSignedIn={isSignedIn} />;
}

function renderDesk(variant: DesignVariant, user: ZoneUser | null) {
  if (variant === "option2") return <Option2IncidentDesk user={user} />;
  if (variant === "option3") return <Option3IncidentDesk user={user} />;
  if (variant === "option4") return <Option4IncidentDesk user={user} />;
  if (variant === "option5") return <Option5IncidentDesk user={user} />;
  if (variant === "option6") return <Option6IncidentDesk user={user} />;
  return <IncidentDesk user={user} />;
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
  const { variant, appPath } = parseDesignPath(currentPath());
  const isAdmin = canAccessDesk(userEmail);

  const zoneId = resolveSelectedZoneId(user);
  const onWelcome = appPath === "/welcome" || appPath === "/select-zone";
  const onLegal = LEGAL_PATHS.has(appPath);
  const onGetStarted = appPath === "/get-started";
  const onHome = appPath === "/";
  const onDesk = appPath === "/dashboard" || appPath === "/desk";

  if (onLegal) {
    return <LegalRoute path={appPath} />;
  }

  if (appPath === DESIGN_HUB_PATH || appPath === "/designs") return <DesignHubPage />;
  if (onGetStarted) return <GetStartedPage user={user} />;

  if (onHome) {
    return renderHome(variant, isSignedIn);
  }

  if (onDesk && !isAdmin) {
    window.location.replace(isSignedIn ? "/get-started" : variantPublicHome(variant));
    return null;
  }

  if (isSignedIn && !zoneId && !onWelcome && isAdmin && onDesk) {
    window.location.replace("/welcome");
    return null;
  }

  if (isSignedIn && zoneId && onWelcome && isAdmin) {
    window.location.replace(variantPublicDesk(variant));
    return null;
  }

  if (onWelcome) return <SelectZonePage user={user} />;

  if (onDesk) {
    return renderDesk(variant, user);
  }

  window.location.replace(variantPublicHome(variant));
  return null;
}
