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

/** Option 4 — Bloom (warm bento landing, numbered scroll desk). */
export function Option4LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const setupHref = designGetStartedHref("option4");

  return (
    <div className="design-option4 o4-shell min-h-screen">
      <header className="o4-header">
        <div className="o4-wrap o4-header-inner">
          <a href="/option-4" className="o4-brand no-underline">
            AlertNav
          </a>
          <nav className="flex items-center gap-3" aria-label="Primary">
            <a href="/design-preview" className="o4-nav-link no-underline">
              Designs
            </a>
            <AuthControls variant="light" />
            {isSignedIn ? (
              <a href={setupHref} className="o4-btn no-underline">
                Continue setup
              </a>
            ) : (
              <GetStartedButton className="o4-btn" label="Get started" />
            )}
          </nav>
        </div>
      </header>

      <main className="o4-wrap o4-main">
        <div className="o4-bento">
          <section className="o4-bento-hero">
            <p className="o4-eyebrow">{BRAND_TAGLINE}</p>
            <h1 className="o4-headline">{HERO_HEADLINE}</h1>
            <p className="o4-desc">{APP_DESCRIPTION}</p>
            <div className="mt-8">
              {isSignedIn ? (
                <a href={setupHref} className="o4-btn o4-btn-lg no-underline">
                  Continue setup →
                </a>
              ) : (
                <GetStartedButton className="o4-btn o4-btn-lg" label="Get started →" />
              )}
            </div>
          </section>

          <aside className="o4-bento-steps" aria-label="How to get AlertNav">
            <p className="o4-card-label">Three steps</p>
            <ol className="o4-step-cards">
              {SETUP_STEPS.map((step) => (
                <li key={step.number} className="o4-step-card">
                  <span className="o4-step-num">{step.number}</span>
                  <div>
                    <p className="o4-step-title">{step.title}</p>
                    <p className="o4-step-detail">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <section className="o4-features" aria-label="How AlertNav helps">
          <div className="o4-section-head">
            <p className="o4-eyebrow">Built for your commute</p>
            <h2 className="o4-section-title">Know before you go</h2>
          </div>
          <div className="o4-feature-grid">
            {NAV_FEATURES.map((feature) => (
              <article key={feature.name} className="o4-feature-tile">
                <h3 className="o4-feature-title">{feature.name}</h3>
                <p className="o4-feature-copy">{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
