import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";
import { isClerkConfigured } from "../lib/clerkKey";

/**
 * Sign-in / sign-up for guests; profile when signed in.
 * Do not use <SignedOut>/<SignedIn> alone — while Clerk is still resolving
 * those render nothing, which hid auth buttons after we stopped blocking
 * the desk on isLoaded.
 */
export function AuthControls({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner variant={variant} />;
}

function AuthControlsInner({ variant }: { variant: "light" | "dark" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const dark = variant === "dark";

  // Guests + Clerk-still-loading: always show Sign in / Sign up (instant desk).
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SignInButton mode="modal" forceRedirectUrl="/welcome">
          <button
            type="button"
            className={
              dark
                ? "btn-auth-light"
                : "rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold tracking-wide text-brand hover:bg-brand-soft"
            }
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/welcome">
          <button
            type="button"
            className="btn-primary px-4 py-2 text-xs tracking-wide"
          >
            Sign up
          </button>
        </SignUpButton>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}
