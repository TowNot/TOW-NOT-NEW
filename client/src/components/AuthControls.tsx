import { UserButton, useAuth } from "@clerk/clerk-react";
import { isClerkConfigured } from "../lib/clerkKey";

const ACCOUNT_HOST = "https://accounts.alertnav.com";

function welcomeRedirectUrl(): string {
  if (typeof window === "undefined") return "https://alertnav.com/welcome";
  return `${window.location.origin}/welcome`;
}

function accountPortalUrl(path: "sign-in" | "sign-up"): string {
  const redirect = encodeURIComponent(welcomeRedirectUrl());
  return `${ACCOUNT_HOST}/${path}?redirect_url=${redirect}`;
}

/**
 * Sign-in / sign-up for guests; profile when signed in.
 * Plain Account Portal links so taps work in installed PWAs (Clerk button wrappers often don't receive touches).
 */
export function AuthControls({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner variant={variant} />;
}

function AuthControlsInner({ variant }: { variant: "light" | "dark" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const dark = variant === "dark";

  if (!isLoaded || !isSignedIn) {
    const signInClass = dark
      ? "btn-auth-compact btn-auth-dark"
      : "rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold tracking-wide text-cobalt hover:bg-ink";
    const signUpClass = dark
      ? "btn-auth-compact btn-auth-dark-primary"
      : "rounded-md bg-cobalt px-3 py-2 text-xs font-semibold tracking-wide text-white hover:brightness-110";
    const touchTarget = "relative z-50 inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center no-underline touch-manipulation";

    return (
      <div className="auth-controls relative z-50 flex shrink-0 flex-wrap items-center gap-2">
        <a href={accountPortalUrl("sign-in")} className={`${signInClass} ${touchTarget}`}>
          Sign in
        </a>
        <a href={accountPortalUrl("sign-up")} className={`${signUpClass} ${touchTarget}`}>
          Sign up
        </a>
      </div>
    );
  }

  return (
    <div className="auth-controls relative z-50 flex shrink-0 flex-wrap items-center gap-2">
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}
