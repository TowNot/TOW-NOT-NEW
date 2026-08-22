import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";
import { isClerkConfigured } from "../lib/clerkKey";

/** Sign-in / sign-up when logged out; profile menu when logged in. */
export function AuthControls() {
  // Avoid Clerk hooks/components when ClerkProvider is not mounted.
  if (!isClerkConfigured()) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SignedOut>
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
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}
