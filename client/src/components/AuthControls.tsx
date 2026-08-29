import { UserButton, useAuth } from "@clerk/clerk-react";
import { accountPortalUrl } from "../lib/clerkPortal";
import { isClerkConfigured } from "../lib/clerkKey";

/**
 * Sign-in / sign-up for guests; profile when signed in.
 * Plain Account Portal links so taps work in installed PWAs.
 */
export function AuthControls({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner variant={variant} />;
}

function AuthControlsInner({ variant }: { variant: "light" | "dark" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const dark = variant === "dark";

  if (!isLoaded || !isSignedIn) {
    const touchTarget = "inline-flex min-h-[2.25rem] cursor-pointer items-center justify-center touch-manipulation";

    return (
      <div className="auth-controls flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <a
          href={accountPortalUrl("sign-in")}
          className={
            dark
              ? `btn-auth-light ${touchTarget}`
              : `${touchTarget} rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold tracking-wide text-brand hover:bg-brand-soft no-underline`
          }
        >
          Sign in
        </a>
        <a
          href={accountPortalUrl("sign-up")}
          className={`btn-primary px-4 py-2 text-xs tracking-wide no-underline ${touchTarget}`}
        >
          Sign up
        </a>
      </div>
    );
  }

  return (
    <div className="auth-controls flex min-w-0 flex-wrap items-center gap-2">
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}
