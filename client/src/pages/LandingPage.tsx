import { AuthControls } from "../components/AuthControls";
import { GetStartedButton } from "../components/GetStartedButton";
import { SiteFooter } from "../components/SiteFooter";
import {
  APP_DESCRIPTION,
  BRAND_TAGLINE,
  HERO_HEADLINE,
  NAV_FEATURES,
  SETUP_STEPS,
} from "../design/copy";

/** Option 1 — Aurora (dark hero, collapsible desk panels). Live app. */
export function LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const setupHref = "/get-started";

  return (
    <div
      className="design-option1 landing-shell min-h-screen text-white"
      style={{ backgroundColor: "#0f172a" }}
    >
      <header className="landing-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/" className="header-logo text-3xl font-bold tracking-tight no-underline md:text-4xl">
            AlertNav
          </a>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Primary">
            {isSignedIn ? (
              <a href={setupHref} className="btn-secondary btn-cta-pair text-sm no-underline">
                Continue setup
              </a>
            ) : (
              <GetStartedButton className="btn-secondary btn-cta-pair text-sm" />
            )}
            <AuthControls variant="dark" />
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero mx-auto max-w-5xl">
          <div className="landing-hero-glow landing-hero-glow-a" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-b" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-c" aria-hidden />

          <div className="hero-panel relative px-6 py-10 md:px-10 md:py-14">
            <p className="section-label text-indigo-200/80">{BRAND_TAGLINE}</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-[3.25rem]">
              {HERO_HEADLINE}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-indigo-100/80 md:text-xl">
              {APP_DESCRIPTION}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isSignedIn ? (
                <a href={setupHref} className="btn-secondary btn-cta-pair no-underline">
                  Continue setup
                </a>
              ) : (
                <GetStartedButton className="btn-secondary btn-cta-pair" />
              )}
            </div>

            <ol className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="How to get AlertNav">
              {SETUP_STEPS.map((step) => (
                <li key={step.number} className="landing-step-card">
                  <span className="landing-step-number">{step.number}</span>
                  <p className="mt-2 text-sm font-bold text-white">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-indigo-100/65">{step.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-16 pt-4" aria-label="How AlertNav helps">
          <p className="section-label text-indigo-200/60">Built for your commute</p>
          <div className="grid gap-4 md:grid-cols-3">
            {NAV_FEATURES.map((feature, index) => (
              <article key={feature.name} className="feature-card">
                <span
                  className={`feature-icon ${
                    index === 0 ? "feature-icon-brand" : "feature-icon-accent"
                  }`}
                  aria-hidden
                >
                  ●
                </span>
                <h2 className="mt-3 text-lg font-bold text-white">{feature.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-indigo-100/70">{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter dark />

      <a
        href="/dashboard"
        className="landing-alerts-fab no-underline"
        aria-label="Open road alerts"
        title="Road alerts"
      >
        <span className="landing-alerts-fab-ring" aria-hidden />
        <svg
          className="landing-alerts-fab-icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M12 3a5.5 5.5 0 0 0-5.5 5.5v2.1l-.9 1.8a1 1 0 0 0 .9 1.45h11a1 1 0 0 0 .9-1.45l-.9-1.8V8.5A5.5 5.5 0 0 0 12 3Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M10 18.5a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </a>
    </div>
  );
}
