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
import { designGetStartedHref } from "../../design/designRoutes";

/** Option 5 — Lumen (glass + iridescent mesh · floating dock desk). */
export function Option5LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const setupHref = designGetStartedHref("option5");

  return (
    <div className="design-option5 o5-shell min-h-screen">
      <div className="o5-mesh" aria-hidden />
      <div className="o5-grid" aria-hidden />

      <nav className="o5-glass-nav" aria-label="Primary">
        <a href="/option-5" className="o5-nav-brand no-underline">
          AlertNav
        </a>
        <span className="o5-nav-divider" aria-hidden />
        <a href="/design-preview" className="o5-nav-link no-underline">
          Designs
        </a>
        <AuthControls variant="dark" />
        {isSignedIn ? (
          <a href={setupHref} className="o5-nav-cta no-underline">
            Continue
          </a>
        ) : (
          <GetStartedButton className="o5-nav-cta" label="Get started" />
        )}
      </nav>

      <main className="o5-main">
        <section className="o5-hero-grid">
          <div className="o5-hero-copy">
            <p className="o5-label">{BRAND_TAGLINE}</p>
            <h1 className="o5-title">
              <span className="o5-title-gradient">{HERO_HEADLINE}</span>
            </h1>
            <p className="o5-lead">{APP_DESCRIPTION}</p>
            <div className="o5-hero-actions">
              {isSignedIn ? (
                <a href={setupHref} className="o5-glow-btn no-underline">
                  Continue setup
                </a>
              ) : (
                <GetStartedButton className="o5-glow-btn" />
              )}
            </div>
          </div>

          <aside className="o5-glass-card" aria-label="How to get AlertNav">
            <p className="o5-card-kicker">Your route in</p>
            <ol className="o5-timeline">
              {SETUP_STEPS.map((step, index) => (
                <li key={step.number} className="o5-timeline-item">
                  <div className="o5-timeline-rail">
                    <span className="o5-timeline-dot">{step.number}</span>
                    {index < SETUP_STEPS.length - 1 ? (
                      <span className="o5-timeline-line" aria-hidden />
                    ) : null}
                  </div>
                  <div>
                    <p className="o5-timeline-title">{step.title}</p>
                    <p className="o5-timeline-detail">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <section className="o5-features" aria-label="How AlertNav helps">
          <p className="o5-label o5-features-label">Built for your commute</p>
          <div className="o5-feature-row">
            {NAV_FEATURES.map((feature) => (
              <article key={feature.name} className="o5-feature-glass">
                <h2 className="o5-feature-name">{feature.name}</h2>
                <p className="o5-feature-text">{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter dark />
    </div>
  );
}
