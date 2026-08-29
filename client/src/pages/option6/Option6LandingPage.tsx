import { AuthControls } from "../../components/AuthControls";
import { GetStartedButton } from "../../components/GetStartedButton";
import { SiteFooter } from "../../components/SiteFooter";
import {
  APP_DESCRIPTION,
  BRAND_TAGLINE,
  HERO_HEADLINE,
  NAV_FEATURES,
  SETUP_STEPS,
} from "../../design/copy";
import { DESIGN_HUB_PATH, designGetStartedHref } from "../../design/designRoutes";

/** Option 6 — Tide (ocean blue + emerald · radar hero · sidebar desk). */
export function Option6LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const setupHref = designGetStartedHref("option6");

  return (
    <div className="design-option6 o6-shell min-h-screen">
      <div className="o6-ocean" aria-hidden />
      <div className="o6-radar-wrap" aria-hidden>
        <div className="o6-radar">
          <span className="o6-radar-ring o6-radar-ring-1" />
          <span className="o6-radar-ring o6-radar-ring-2" />
          <span className="o6-radar-ring o6-radar-ring-3" />
          <span className="o6-radar-sweep" />
          <span className="o6-radar-core" />
        </div>
      </div>

      <header className="o6-topbar">
        <a href="/option-6" className="o6-brand no-underline">
          <span className="o6-brand-mark" aria-hidden />
          AlertNav
        </a>
        <nav className="o6-topnav" aria-label="Primary">
          <a href={DESIGN_HUB_PATH} className="o6-toplink no-underline">
            All designs
          </a>
          {isSignedIn ? (
            <a href={setupHref} className="o6-topcta no-underline">
              Continue setup
            </a>
          ) : (
            <GetStartedButton className="o6-topcta" label="Get started" />
          )}
          <AuthControls variant="dark" />
        </nav>
      </header>

      <main className="o6-hero-block">
        <section className="o6-hero">
          <p className="o6-kicker">{BRAND_TAGLINE}</p>
          <h1 className="o6-headline">
            <span className="o6-headline-line">{HERO_HEADLINE}</span>
          </h1>
          <p className="o6-lead">{APP_DESCRIPTION}</p>
          <div className="o6-hero-cta">
            {isSignedIn ? (
              <a href={setupHref} className="o6-primary-btn no-underline">
                Continue setup
              </a>
            ) : (
              <GetStartedButton className="o6-primary-btn" />
            )}
          </div>

          <ol className="o6-steps" aria-label="How to get AlertNav">
            {SETUP_STEPS.map((step, index) => (
              <li key={step.number} className="o6-step">
                {index > 0 ? <span className="o6-step-bridge" aria-hidden /> : null}
                <span className="o6-step-badge">{step.number}</span>
                <span className="o6-step-copy">
                  <span className="o6-step-title">{step.title}</span>
                  <span className="o6-step-detail">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <div className="o6-wave-divider" aria-hidden />

      <section className="o6-shore" aria-label="How AlertNav helps">
        <p className="o6-shore-kicker">Built for your commute</p>
        <div className="o6-feature-grid">
          {NAV_FEATURES.map((feature, index) => (
            <article key={feature.name} className="o6-feature-card">
              <span className={`o6-feature-icon o6-feature-icon-${index + 1}`} aria-hidden />
              <div>
                <h2 className="o6-feature-name">{feature.name}</h2>
                <p className="o6-feature-detail">{feature.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
