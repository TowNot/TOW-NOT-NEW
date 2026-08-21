import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";

/** Sign-in / sign-up when logged out; profile menu when logged in. */
export function AuthControls() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-gray-700 hover:bg-ink"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button
            type="button"
            className="rounded-md bg-gray-900 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-white hover:bg-black"
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
