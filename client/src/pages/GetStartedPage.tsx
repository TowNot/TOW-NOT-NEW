import { useUser } from "@clerk/clerk-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { AuthControls } from "../components/AuthControls";
import { GetStartedButton } from "../components/GetStartedButton";
import { SiteFooter } from "../components/SiteFooter";
import { type ZoneUser } from "../hooks/useSelectedZone";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { isClerkConfigured } from "../lib/clerkKey";
import { destinationCta, resolveAppDestination } from "../lib/onboarding";
import { buildStripeCheckoutUrl } from "../lib/stripeCheckout";

const ONBOARDING_STEPS = [
  {
    number: "1",
    title: "Create your account",
    detail: "Sign up with your email to secure your account and manage your subscription.",
  },
  {
    number: "2",
    title: "Subscribe",
    detail: "Start your plan on our secure checkout — billing is handled by Stripe.",
  },
  {
    number: "3",
    title: "Download the app",
    detail: "Install AlertNav on your phone to finish setup in the app.",
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

  const monthlyCheckoutUrl = buildStripeCheckoutUrl({
    email: accountEmail,
    clientReferenceId: clerkUser?.id ?? user?.id ?? null,
    billing: "monthly",
  });

  const yearlyCheckoutUrl = buildStripeCheckoutUrl({
    email: accountEmail,
    clientReferenceId: clerkUser?.id ?? user?.id ?? null,
    billing: "yearly",
  });

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

  const accountDone = Boolean(isSignedIn);
  const subscribeDone = subscribed;
  const installDone = subscribeDone;
  const nextDestination = resolveAppDestination({
    isSignedIn: Boolean(isSignedIn),
    subscribed: subscribeDone,
  });
  const nextCta = destinationCta(nextDestination);

  useEffect(() => {
    if (!checkoutSuccess || !subscribeDone || subscriptionLoading) return;
    window.location.replace(nextDestination);
  }, [checkoutSuccess, subscribeDone, subscriptionLoading, nextDestination]);

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
    <div className="page-shell min-h-screen overflow-x-clip">
      <header className="app-header">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <a href="/" className="header-logo text-xl font-bold tracking-tight no-underline">
            AlertNav
          </a>
          <AuthControls variant="dark" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-5">
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

        {subscribeDone ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={nextCta.href} className="btn-primary px-5 py-2.5 text-sm no-underline">
              {nextCta.label}
            </a>
            {nextDestination === "/dashboard" ? (
              <p className="text-sm text-muted">
                Your subscription is active. Install the app below for push alerts, or open the desk
                now.
              </p>
            ) : null}
          </div>
        ) : null}

        <ol className="mt-10 space-y-4">
          <OnboardingStep done={accountDone} active={!accountDone} step={ONBOARDING_STEPS[0]}>
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
              <div className="space-y-4">
                <PricingPlansGrid
                  monthlyCheckoutUrl={monthlyCheckoutUrl}
                  yearlyCheckoutUrl={yearlyCheckoutUrl}
                />
                {subscriptionLoading ? (
                  <p className="text-xs text-muted">Checking subscription…</p>
                ) : null}
              </div>
            )}
          </OnboardingStep>

          <OnboardingStep
            done={installDone}
            active={subscribeDone && !installDone}
            step={ONBOARDING_STEPS[2]}
          >
            {!subscribeDone ? (
              <p className="text-sm text-muted">Available after you subscribe.</p>
            ) : (
              <div>
                <button
                  type="button"
                  className="progressier-install-button btn-secondary px-5 py-2.5 text-sm"
                >
                  Install AlertNav
                </button>
                <p className="mt-3 max-w-md text-xs leading-relaxed text-muted">
                  On iPhone: follow the Add to Home Screen steps. On Android: use the install
                  prompt. You can install anytime — it does not block dashboard access.
                </p>
                <a
                  href={nextCta.href}
                  className="mt-4 inline-flex text-sm font-semibold text-accent-deep no-underline hover:underline"
                >
                  {nextCta.label} →
                </a>
              </div>
            )}
          </OnboardingStep>
        </ol>
      </main>
    </div>
  );
}

const PLAN_FEATURES = ["Cancel anytime via Stripe"] as const;

function PricingPlansGrid({
  monthlyCheckoutUrl,
  yearlyCheckoutUrl,
}: {
  monthlyCheckoutUrl: string;
  yearlyCheckoutUrl: string;
}) {
  return (
    <div className="pricing-plans-grid">
      <article className="pricing-plan-card">
        <h3 className="pricing-plan-title">Monthly</h3>
        <p className="pricing-plan-price">$59.99 CAD / month</p>
        <ul className="pricing-plan-features">
          {PLAN_FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <a
          href={monthlyCheckoutUrl}
          className="pricing-plan-cta btn-outline-light mt-auto w-full px-5 py-2.5 text-sm no-underline"
        >
          Start 7-Day Free Trial
        </a>
      </article>

      <article className="pricing-plan-card pricing-plan-card-featured">
        <div className="pricing-plan-badges">
          <span className="pricing-plan-badge-free">2 Months Free</span>
          <span className="pricing-plan-badge-popular">Popular</span>
        </div>
        <h3 className="pricing-plan-title">Yearly</h3>
        <p className="pricing-plan-price">$599.00 CAD / year</p>
        <ul className="pricing-plan-features">
          {PLAN_FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <a
          href={yearlyCheckoutUrl}
          className="pricing-plan-cta btn-primary mt-auto w-full px-5 py-2.5 text-sm no-underline"
        >
          Start 7-Day Free Trial
        </a>
      </article>
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
