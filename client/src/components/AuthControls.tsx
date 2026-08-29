import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";
import { isClerkConfigured } from "../lib/clerkKey";

/**
 * Sign-in / sign-up for guests; profile when signed in.
 * Always uses redirect — Clerk modals often do nothing in mobile browsers and PWAs.
 */
export function AuthControls({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner variant={variant} />;
}

function AuthControlsInner({ variant }: { variant: "light" | "dark" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const dark = variant === "dark";

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SignInButton mode="redirect" forceRedirectUrl="/welcome">
          <button
            type="button"
            className={
              dark
                ? "btn-auth-compact btn-auth-dark"
                : "rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold tracking-wide text-cobalt hover:bg-ink"
            }
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="redirect" forceRedirectUrl="/welcome">
          <button
            type="button"
            className={
              dark
                ? "btn-auth-compact btn-auth-dark-primary"
                : "rounded-md bg-cobalt px-3 py-2 text-xs font-semibold tracking-wide text-white hover:brightness-110"
            }
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
