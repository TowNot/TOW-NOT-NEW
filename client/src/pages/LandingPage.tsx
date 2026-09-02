import { UserButton } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { GetStartedButton } from "../components/GetStartedButton";
import { InstallAlertNavButton, INSTALL_APP_HINT } from "../components/InstallAlertNavButton";
import { SiteFooter } from "../components/SiteFooter";
import {
  APP_DESCRIPTION,
  BRAND_TAGLINE,
  HERO_HEADLINE,
  SETUP_STEPS,
} from "../design/copy";
import { accountPortalUrl } from "../lib/clerkPortal";
import { isClerkConfigured } from "../lib/clerkKey";
import {
  clearSessionReplacedFromUrl,
  readSessionReplacedFromUrl,
  SESSION_REPLACED_MESSAGE,
} from "../lib/deviceSession";
import { destinationCta, resolveAppDestination } from "../lib/onboarding";

const headerAuthTouch =
  "inline-flex min-h-[2.25rem] cursor-pointer items-center justify-center touch-manipulation";

function LandingHeaderNav({ isSignedIn }: { isSignedIn: boolean }) {
  if (isSignedIn && isClerkConfigured()) {
    return (
      <nav className="landing-header-nav shrink-0" aria-label="Primary">
        <UserButton afterSignOutUrl="/" />
      </nav>
    );
  }

  return (
    <nav className="landing-header-nav shrink-0" aria-label="Primary">
      <a
        href={accountPortalUrl("sign-in")}
        className={`btn-auth-light ${headerAuthTouch} no-underline`}
      >
        Sign in
      </a>
      <a
        href={accountPortalUrl("sign-up")}
        className={`btn-primary px-4 py-2 text-xs tracking-wide no-underline ${headerAuthTouch}`}
      >
        Start Your Free Trial
      </a>
    </nav>
  );
}

/** Option 1 — Aurora (dark hero, glass card). Public landing — no desk shortcuts. */
export function LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const [sessionReplaced] = useState(() => readSessionReplacedFromUrl());
  const destination = resolveAppDestination({ isSignedIn });
  const heroCta = destinationCta(destination);

  useEffect(() => {
    if (sessionReplaced) clearSessionReplacedFromUrl();
  }, [sessionReplaced]);

  return (
    <div className="landing-shell min-h-screen text-white" style={{ backgroundColor: "#0f172a" }}>
      {sessionReplaced ? (
        <div
          className="border-b border-indigo-400/30 bg-indigo-950/80 px-4 py-3 text-center text-sm text-indigo-100"
          role="status"
        >
          {SESSION_REPLACED_MESSAGE}
        </div>
      ) : null}
      <header className="landing-header">
        <div className="landing-header-inner mx-auto max-w-5xl px-4 py-4 sm:px-5 sm:py-5">
          <a
            href="/"
            className="header-logo shrink-0 text-2xl font-bold tracking-tight no-underline sm:text-3xl md:text-4xl"
          >
            AlertNav
          </a>
          <LandingHeaderNav isSignedIn={isSignedIn} />
        </div>
      </header>

      <main className="min-w-0 overflow-x-clip">
        <section className="landing-hero mx-auto max-w-5xl">
          <div className="landing-hero-glow landing-hero-glow-a" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-b" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-c" aria-hidden />

          <div className="hero-panel landing-hero-panel relative px-4 py-6 sm:px-6 sm:py-10 md:px-10 md:py-14">
            <p className="section-label text-indigo-200/80">{BRAND_TAGLINE}</p>
            <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl">
              {HERO_HEADLINE}
            </h1>
            <p className="landing-hero-description mx-auto mt-4 max-w-2xl text-base leading-relaxed text-indigo-100/80 sm:mt-5 sm:text-lg md:text-xl">
              {APP_DESCRIPTION}
            </p>
            <div className="landing-hero-cta mt-6 sm:mt-8">
              {isSignedIn ? (
                <div className="landing-hero-cta-group">
                  <a href={heroCta.href} className="btn-secondary btn-cta-pair no-underline">
                    {heroCta.label}
                  </a>
                  <InstallAlertNavButton />
                </div>
              ) : (
                <GetStartedButton className="btn-secondary btn-cta-pair" label="Start Your Free Trial" />
              )}
            </div>
            {isSignedIn ? (
              <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-indigo-100/65 sm:text-sm">
                {INSTALL_APP_HINT}
              </p>
            ) : null}

            <ol className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3" aria-label="How to get AlertNav">
              {SETUP_STEPS.map((step) => (
                <li key={step.number} className="landing-step-card flex flex-col items-center text-center">
                  <span className="landing-step-number">{step.number}</span>
                  <p className="mt-2 text-sm font-bold text-white">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-indigo-100/65">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-10 sm:px-5 sm:pb-14">
          <div className="landing-step-card mx-auto max-w-2xl px-5 py-6 text-center sm:px-8 sm:py-8">
            <p className="section-label text-indigo-200/80">Product feedback</p>
            <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
              Have a suggestion or question?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-indigo-100/75 sm:text-base">
              We review every message and do our best to improve AlertNav based on what drivers
              tell us.
            </p>
            <a
              href="/product-suggestions"
              className="btn-outline-cobalt mt-5 inline-flex min-h-[2.75rem] items-center justify-center px-6 py-2.5 text-sm no-underline"
            >
              Suggestions &amp; questions
            </a>
          </div>
        </section>
      </main>

      <SiteFooter dark />
    </div>
  );
}
