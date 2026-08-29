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

/** Option 3 — Pulse (minimal centered landing, tabbed desk). */
export function Option3LandingPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const setupHref = designGetStartedHref("option3");

  return (
    <div className="design-option3 o3-shell min-h-screen">
      <div className="o3-glow" aria-hidden />

      <header className="o3-header">
        <a href="/option-3" className="o3-wordmark no-underline">
          AlertNav
        </a>
        <div className="flex items-center gap-4">
          <a href="/design-preview" className="o3-link-muted no-underline">
            Designs
          </a>
          <AuthControls variant="dark" />
        </div>
      </header>

      <main className="o3-main">
        <section className="o3-hero">
          <p className="o3-kicker">{BRAND_TAGLINE}</p>
          <h1 className="o3-title">{HERO_HEADLINE}</h1>
          <p className="o3-blurb">{APP_DESCRIPTION}</p>

          <div className="o3-cta-wrap">
            {isSignedIn ? (
              <a href={setupHref} className="o3-cta no-underline">
                Continue setup
              </a>
            ) : (
              <GetStartedButton className="o3-cta" label="Get started" />
            )}
          </div>

          <ol className="o3-path" aria-label="How to get AlertNav">
            {SETUP_STEPS.map((step, index) => (
              <li key={step.number} className="o3-path-item">
                {index > 0 ? <span className="o3-path-line" aria-hidden /> : null}
                <span className="o3-path-num">{step.number}</span>
                <span className="o3-path-label">{step.title}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="o3-features" aria-label="How AlertNav helps">
          <p className="o3-kicker o3-features-kicker">Built for your commute</p>
          <ul className="o3-feature-list">
            {NAV_FEATURES.map((feature) => (
              <li key={feature.name} className="o3-feature-item">
                <span className="o3-feature-name">{feature.name}</span>
                <span className="o3-feature-detail">{feature.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter dark />
    </div>
  );
}
