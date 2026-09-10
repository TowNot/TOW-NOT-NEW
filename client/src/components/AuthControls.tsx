import { UserButton, useAuth } from "@clerk/clerk-react";
import { useState } from "react";
import { accountPortalUrl } from "../lib/clerkPortal";
import { isClerkConfigured } from "../lib/clerkKey";
import { openStripeBillingPortal } from "../lib/stripeBillingPortal";

/**
 * Sign-in / sign-up for guests; profile (+ optional billing icon) when signed in.
 * Plain Account Portal links so taps work in installed PWAs.
 */
export function AuthControls({
  variant = "light",
  signUpLabel = "Sign up",
  /** Desk only — small icon beside Clerk; billing stays in the Clerk menu everywhere. */
  showBillingButton = false,
}: {
  variant?: "light" | "dark";
  signUpLabel?: string;
  showBillingButton?: boolean;
}) {
  if (!isClerkConfigured()) return null;

  return (
    <AuthControlsInner
      variant={variant}
      signUpLabel={signUpLabel}
      showBillingButton={showBillingButton}
    />
  );
}

function BillingCardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="2" />
      <path d="M2.75 10.25h18.5" />
      <path d="M6.5 15.25h4" />
    </svg>
  );
}

function AuthControlsInner({
  variant,
  signUpLabel,
  showBillingButton,
}: {
  variant: "light" | "dark";
  signUpLabel: string;
  showBillingButton: boolean;
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
    const touchTarget =
      "inline-flex min-h-[2.25rem] cursor-pointer items-center justify-center touch-manipulation";

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
        {showBillingButton ? (
          <button
            type="button"
            disabled={billingBusy}
            onClick={onManageBilling}
            title="Manage billing"
            aria-label={billingBusy ? "Opening billing" : "Manage billing"}
            className={
              dark
                ? "inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-60"
                : "inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full border border-line bg-surface text-brand transition hover:bg-brand-soft disabled:opacity-60"
            }
          >
            <BillingCardIcon className="h-4 w-4" />
          </button>
        ) : null}
        <UserButton afterSignOutUrl="/">
          <UserButton.MenuItems>
            <UserButton.Action label="Manage billing" onClick={onManageBilling} />
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
