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

/** Option 1 — Aurora (dark hero, glass card). Public landing — no desk/install shortcuts. */
export function LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <div className="landing-shell min-h-screen text-white" style={{ backgroundColor: "#0f172a" }}>
      <header className="landing-header">
        <div className="landing-header-inner mx-auto max-w-5xl px-4 py-4 sm:px-5 sm:py-5">
          <a
            href="/"
            className="header-logo shrink-0 text-2xl font-bold tracking-tight no-underline sm:text-3xl md:text-4xl"
          >
            AlertNav
          </a>
          <nav className="landing-header-nav" aria-label="Primary">
            {isSignedIn ? (
              <a href="/get-started" className="btn-secondary btn-header-compact no-underline">
                Continue setup
              </a>
            ) : (
              <GetStartedButton className="btn-secondary btn-header-compact" />
            )}
            <AuthControls variant="dark" />
          </nav>
        </div>
      </header>

      <main className="min-w-0 overflow-x-clip">
        <section className="landing-hero mx-auto max-w-5xl">
          <div className="landing-hero-glow landing-hero-glow-a" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-b" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-c" aria-hidden />

          <div className="hero-panel relative px-4 py-6 sm:px-6 sm:py-10 md:px-10 md:py-14">
            <p className="section-label text-indigo-200/80">{BRAND_TAGLINE}</p>
            <h1 className="max-w-3xl text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl">
              {HERO_HEADLINE}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-indigo-100/80 sm:mt-5 sm:text-lg md:text-xl">
              {APP_DESCRIPTION}
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
              {isSignedIn ? (
                <a href="/get-started" className="btn-secondary btn-cta-pair no-underline">
                  Continue setup
                </a>
              ) : (
                <GetStartedButton className="btn-secondary btn-cta-pair" />
              )}
            </div>

            <ol className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3" aria-label="How to get AlertNav">
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

        <section
          className="mx-auto max-w-5xl px-4 pb-12 pt-2 sm:px-5 sm:pb-16 sm:pt-4"
          aria-label="How AlertNav helps"
        >
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
    </div>
  );
}
