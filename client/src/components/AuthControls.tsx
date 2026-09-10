import { UserButton, useAuth } from "@clerk/clerk-react";
import { useState } from "react";
import { accountPortalUrl } from "../lib/clerkPortal";
import { isClerkConfigured } from "../lib/clerkKey";
import { openStripeBillingPortal } from "../lib/stripeBillingPortal";

/**
 * Sign-in / sign-up for guests; profile + billing when signed in.
 * Plain Account Portal links so taps work in installed PWAs.
 */
export function AuthControls({
  variant = "light",
  signUpLabel = "Sign up",
}: {
  variant?: "light" | "dark";
  signUpLabel?: string;
}) {
  if (!isClerkConfigured()) return null;

  return <AuthControlsInner variant={variant} signUpLabel={signUpLabel} />;
}

function AuthControlsInner({
  variant,
  signUpLabel,
}: {
  variant: "light" | "dark";
  signUpLabel: string;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const dark = variant === "dark";
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  const onManageBilling = () => {
    setBillingError(null);
    setBillingBusy(true);
    void openStripeBillingPortal()
      .catch((caught) => {
        setBillingError(caught instanceof Error ? caught.message : "Unable to open billing");
      })
      .finally(() => setBillingBusy(false));
  };

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
          {signUpLabel}
        </a>
      </div>
    );
  }

  return (
    <div className="auth-controls flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={billingBusy}
          onClick={onManageBilling}
          className={
            dark
              ? "btn-auth-light inline-flex min-h-[2.25rem] items-center justify-center touch-manipulation disabled:opacity-60"
              : "inline-flex min-h-[2.25rem] touch-manipulation items-center justify-center rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold tracking-wide text-brand hover:bg-brand-soft disabled:opacity-60"
          }
        >
          {billingBusy ? "Opening…" : "Manage billing"}
        </button>
        <UserButton afterSignOutUrl="/">
          <UserButton.MenuItems>
            <UserButton.Action
              label="Manage billing"
              onClick={onManageBilling}
            />
          </UserButton.MenuItems>
        </UserButton>
      </div>
      {billingError ? (
        <p className="max-w-[14rem] text-right text-[11px] leading-snug text-rose-600" role="alert">
          {billingError}
        </p>
      ) : null}
    </div>
  );
}
