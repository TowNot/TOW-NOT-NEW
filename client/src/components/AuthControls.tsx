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
export function AuthControls() {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner />;
}

function AuthControlsInner() {
  const { isLoaded, isSignedIn } = useAuth();

  // Guests + Clerk-still-loading: always show Sign in / Sign up (instant desk).
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SignInButton mode="modal" forceRedirectUrl="/welcome">
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold tracking-wide text-cobalt hover:bg-ink"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/welcome">
          <button
            type="button"
            className="rounded-md bg-cobalt px-3 py-2 text-xs font-semibold tracking-wide text-white hover:brightness-110"
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
