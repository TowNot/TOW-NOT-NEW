import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";
import type { MouseEvent } from "react";
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
 * Uses direct Account Portal links so taps work in PWAs (Clerk modal/wrapper buttons often don't).
 */
export function AuthControls({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner variant={variant} />;
}

function AuthControlsInner({ variant }: { variant: "light" | "dark" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const dark = variant === "dark";

  if (!isLoaded || !isSignedIn) {
    const signInClass = dark
      ? "btn-auth-compact btn-auth-dark"
      : "rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold tracking-wide text-cobalt hover:bg-ink";
    const signUpClass = dark
      ? "btn-auth-compact btn-auth-dark-primary"
      : "rounded-md bg-cobalt px-3 py-2 text-xs font-semibold tracking-wide text-white hover:brightness-110";

    const goSignIn = (event: MouseEvent<HTMLAnchorElement>) => {
      if (!clerk.loaded) return;
      event.preventDefault();
      void clerk.redirectToSignIn({ redirectUrl: welcomeRedirectUrl() });
    };

    const goSignUp = (event: MouseEvent<HTMLAnchorElement>) => {
      if (!clerk.loaded) return;
      event.preventDefault();
      void clerk.redirectToSignUp({ redirectUrl: welcomeRedirectUrl() });
    };

    return (
      <div className="auth-controls relative z-50 flex shrink-0 flex-wrap items-center gap-2">
        <a
          href={accountPortalUrl("sign-in")}
          onClick={goSignIn}
          className={`${signInClass} relative z-50 inline-flex cursor-pointer no-underline`}
        >
          Sign in
        </a>
        <a
          href={accountPortalUrl("sign-up")}
          onClick={goSignUp}
          className={`${signUpClass} relative z-50 inline-flex cursor-pointer no-underline`}
        >
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
