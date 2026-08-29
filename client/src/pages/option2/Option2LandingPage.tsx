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

/** Option 2 — Command (light split layout, sidebar desk). */
export function Option2LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const setupHref = designGetStartedHref("option2");

  return (
    <div className="design-option2 o2-shell min-h-screen">
      <header className="o2-topbar">
        <div className="o2-container flex items-center justify-between gap-4 py-4">
          <a href="/option-2" className="o2-logo no-underline">
            AlertNav
          </a>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Primary">
            <a href="/design-preview" className="o2-nav-pill no-underline">
              Compare designs
            </a>
            <AuthControls variant="light" />
            {isSignedIn ? (
              <a href={setupHref} className="o2-btn-primary no-underline">
                Continue setup
              </a>
            ) : (
              <GetStartedButton className="o2-btn-primary" label="Get started" />
            )}
          </nav>
        </div>
      </header>

      <main className="o2-container pb-16 pt-8 md:pt-12">
        <div className="o2-hero-grid">
          <section className="o2-hero-copy">
            <p className="o2-eyebrow">{BRAND_TAGLINE}</p>
            <h1 className="o2-headline">{HERO_HEADLINE}</h1>
            <p className="o2-lead">{APP_DESCRIPTION}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {isSignedIn ? (
                <a href={setupHref} className="o2-btn-primary no-underline">
                  Continue setup
                </a>
              ) : (
                <GetStartedButton className="o2-btn-primary" />
              )}
              <p className="text-sm text-stone-500">
                <span className="font-semibold text-stone-700">Start here</span> — account, subscribe,
                install
              </p>
            </div>
          </section>

          <aside className="o2-setup-card" aria-label="How to get AlertNav">
            <p className="o2-setup-card-title">Your path to AlertNav</p>
            <ol className="o2-setup-steps">
              {SETUP_STEPS.map((step) => (
                <li key={step.number} className="o2-setup-step">
                  <span className="o2-setup-step-num">{step.number}</span>
                  <div>
                    <p className="o2-setup-step-title">{step.title}</p>
                    <p className="o2-setup-step-detail">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <section className="mt-14 md:mt-20" aria-label="How AlertNav helps">
          <div className="o2-section-head">
            <p className="o2-eyebrow">Built for your commute</p>
            <h2 className="o2-section-title">Everything you need on the road</h2>
          </div>
          <div className="o2-feature-grid">
            {NAV_FEATURES.map((feature) => (
              <article key={feature.name} className="o2-feature-card">
                <span className="o2-feature-icon" aria-hidden>
                  →
                </span>
                <h3 className="o2-feature-name">{feature.name}</h3>
                <p className="o2-feature-detail">{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
