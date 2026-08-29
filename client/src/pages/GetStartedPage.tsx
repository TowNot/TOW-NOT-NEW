import { useUser } from "@clerk/clerk-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthControls } from "../components/AuthControls";
import { GetStartedButton } from "../components/GetStartedButton";
import { SiteFooter } from "../components/SiteFooter";
import { useProgressier } from "../hooks/useProgressier";
import { useSelectedZone, type ZoneUser } from "../hooks/useSelectedZone";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { isClerkConfigured } from "../lib/clerkKey";
import { buildStripeCheckoutUrl } from "../lib/stripeCheckout";
import { selectableCoverageZones, type ZoneId } from "../lib/zones";

const ONBOARDING_STEPS = [
  {
    number: "1",
    title: "Create your account",
    detail: "Sign up with email so AlertNav can save your city and subscription.",
  },
  {
    number: "2",
    title: "Subscribe",
    detail: "Start your plan on our secure checkout — billing is handled by Stripe.",
  },
  {
    number: "3",
    title: "Download the app",
    detail: "Install AlertNav on your phone for push alerts on nearby disruptions.",
  },
] as const;

export function GetStartedPage({ user }: { user?: ZoneUser | null }) {
  if (!isClerkConfigured()) {
    return <GetStartedPageNoAuth />;
  }
  return <GetStartedPageWithAuth user={user} />;
}

function GetStartedPageNoAuth() {
  return (
    <div className="landing-shell min-h-screen text-white" style={{ backgroundColor: "#0f172a" }}>
      <header className="landing-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/" className="header-logo text-2xl font-bold tracking-tight no-underline">
            AlertNav
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Sign-in is not configured yet</h1>
        <p className="mt-4 text-indigo-100/75">
          Add <span className="font-mono text-sm">VITE_CLERK_PUBLISHABLE_KEY</span> to{" "}
          <span className="font-mono text-sm">client/.env</span>, then restart the dev server.
        </p>
        <a href="/" className="btn-outline-cobalt btn-cta-pair mt-8 inline-flex no-underline">
          Back to home
        </a>
      </main>
      <SiteFooter dark />
    </div>
  );
}

function GetStartedPageWithAuth({ user }: { user?: ZoneUser | null }) {
  const { isSignedIn, user: clerkUser } = useUser();
  const accountEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null;
  const { active: subscribed, loading: subscriptionLoading, refresh } = useSubscriptionStatus();
  const { selectedZoneId, saveZone } = useSelectedZone(user);
  const { busy: installBusy, enabled: pushEnabled, error: installError, enablePush } =
    useProgressier();
  const [zoneBusy, setZoneBusy] = useState<ZoneId | null>(null);
  const zones = selectableCoverageZones();

  const checkoutSuccess = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("checkout") === "success";
  }, []);

  useEffect(() => {
    if (!checkoutSuccess) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [checkoutSuccess, refresh]);

  const checkoutUrl = buildStripeCheckoutUrl({
    email: accountEmail,
    clientReferenceId: clerkUser?.id ?? user?.id ?? null,
  });

  const accountDone = Boolean(isSignedIn);
  const subscribeDone = subscribed;
  const zoneDone = Boolean(selectedZoneId);
  const installDone = pushEnabled;

  if (!isSignedIn) {
    return (
      <div className="landing-shell min-h-screen text-white" style={{ backgroundColor: "#0f172a" }}>
        <header className="landing-header">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
            <a href="/" className="header-logo text-2xl font-bold tracking-tight no-underline">
              AlertNav
            </a>
            <AuthControls variant="dark" />
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-5 py-16 text-center">
          <p className="section-label text-indigo-200/70">Get started</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            Create your account to continue
          </h1>
          <p className="mt-4 text-indigo-100/75">
            Subscribe and install AlertNav after you sign up — it only takes a few minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <GetStartedButton className="btn-secondary btn-cta-pair" />
          </div>
        </main>
        <SiteFooter dark />
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen">
      <header className="app-header">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <a href="/" className="header-logo text-xl font-bold tracking-tight no-underline">
            AlertNav
          </a>
          <AuthControls variant="dark" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="section-label">Get started</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Set up AlertNav
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Create your account, subscribe, then install the app on your phone for nearby road alerts.
        </p>

        {checkoutSuccess && !subscribeDone && !subscriptionLoading ? (
          <p className="mt-4 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3 text-sm text-accent-deep">
            Payment received — finishing activation. This usually takes a few seconds.
          </p>
        ) : null}

        <ol className="mt-10 space-y-4">
          <OnboardingStep
            done={accountDone}
            active={!accountDone}
            step={ONBOARDING_STEPS[0]}
          >
            <p className="text-sm text-muted">
              Signed in as{" "}
              <span className="font-semibold text-foreground">
                {accountEmail ?? "your account"}
              </span>
            </p>
          </OnboardingStep>

          <OnboardingStep
            done={subscribeDone}
            active={accountDone && !subscribeDone}
            step={ONBOARDING_STEPS[1]}
          >
            {subscribeDone ? (
              <p className="text-sm text-accent-deep">Subscription active</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <a href={checkoutUrl} className="btn-primary px-5 py-2.5 text-sm no-underline">
                  Subscribe now
                </a>
                {subscriptionLoading ? (
                  <span className="text-xs text-muted">Checking subscription…</span>
                ) : null}
              </div>
            )}
          </OnboardingStep>

          <OnboardingStep
            done={installDone && zoneDone}
            active={subscribeDone && (!zoneDone || !installDone)}
            step={ONBOARDING_STEPS[2]}
          >
            {!subscribeDone ? (
              <p className="text-sm text-muted">Available after you subscribe.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Choose your coverage zone
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {zones.map((zone) => (
                      <li key={zone.id}>
                        <button
                          type="button"
                          disabled={zoneBusy !== null}
                          onClick={() => {
                            setZoneBusy(zone.id);
                            void saveZone(zone.id).finally(() => setZoneBusy(null));
                          }}
                          className={
                            selectedZoneId === zone.id
                              ? "w-full rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-left text-sm font-semibold text-brand-deep"
                              : "w-full rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm font-semibold text-foreground hover:border-brand/25"
                          }
                        >
                          {zone.name}
                          {zoneBusy === zone.id ? (
                            <span className="mt-1 block text-xs font-normal text-muted">
                              Saving…
                            </span>
                          ) : selectedZoneId === zone.id ? (
                            <span className="mt-1 block text-xs font-normal text-brand">
                              Selected
                            </span>
                          ) : (
                            <span className="mt-1 block text-xs font-normal text-muted">
                              {zone.region}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    Install on this device
                  </p>
                  <button
                    type="button"
                    disabled={!zoneDone || installBusy || installDone}
                    onClick={() => void enablePush()}
                    className="btn-secondary px-5 py-2.5 text-sm disabled:opacity-60"
                  >
                    {installDone
                      ? "App installed"
                      : installBusy
                        ? "Installing…"
                        : "Install AlertNav"}
                  </button>
                  {!zoneDone ? (
                    <p className="mt-2 text-xs text-muted">Pick a zone first.</p>
                  ) : null}
                  {installError ? (
                    <p className="mt-2 text-xs text-red-600">{installError}</p>
                  ) : null}
                  {installDone ? (
                    <p className="mt-2 text-xs text-accent-deep">
                      You&apos;re all set — AlertNav will notify you about nearby disruptions.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted">
                      On iPhone: Share → Add to Home Screen. On Android: follow the install prompt.
                    </p>
                  )}
                </div>
              </div>
            )}
          </OnboardingStep>
        </ol>
      </main>
    </div>
  );
}

function OnboardingStep({
  step,
  done,
  active,
  children,
}: {
  step: (typeof ONBOARDING_STEPS)[number];
  done: boolean;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={`onboarding-step ${done ? "onboarding-step-done" : ""} ${
        active ? "onboarding-step-active" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <span className="onboarding-step-badge" aria-hidden>
          {done ? "✓" : step.number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">{step.title}</h2>
          <p className="mt-1 text-sm text-muted">{step.detail}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </li>
  );
}
