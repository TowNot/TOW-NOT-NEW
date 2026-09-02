import { accountPortalUrl } from "./clerkPortal";

export type AppDestination = "/get-started" | "/welcome" | "/dashboard";

export function loginRedirectUrl(returnPath = "/dashboard"): string {
  const safeReturn = returnPath.startsWith("/") ? returnPath : "/dashboard";
  return `/login?return=${encodeURIComponent(safeReturn)}`;
}

export function signInUrl(returnPath?: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://alertnav.com";
  const destination = returnPath ?? `${origin}/dashboard`;
  return accountPortalUrl("sign-in", destination.startsWith("http") ? destination : `${origin}${destination}`);
}

export function resolveAppDestination(options: {
  isSignedIn: boolean;
}): AppDestination {
  if (!options.isSignedIn) return "/get-started";
  return "/dashboard";
}

export function destinationCta(destination: AppDestination): { href: string; label: string } {
  switch (destination) {
    case "/dashboard":
      return { href: "/dashboard", label: "Enter Dashboard" };
    case "/welcome":
      return { href: "/welcome", label: "Choose your city" };
    default:
      return { href: "/get-started", label: "Continue setup" };
  }
}
