import { resolveStripeCheckoutUrl } from "../lib/stripeCheckout";
import { AuthControls } from "../components/AuthControls";
import { SiteFooter } from "../components/SiteFooter";

const STRIPE_CHECKOUT_URL = resolveStripeCheckoutUrl();

const NAV_FEATURES = [
  {
    name: "Waze",
    detail: "One tap opens the pin in Waze for turn-by-turn guidance.",
  },
  {
    name: "Google Maps",
    detail: "Or jump straight into Google Maps with the same coordinates.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <header className="bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
          <a
            href="/"
            className="text-3xl font-bold tracking-tight text-cobalt no-underline md:text-4xl"
          >
            AlertNav
          </a>
          <nav className="flex items-center gap-3 sm:gap-4" aria-label="Primary">
            {/* TEMP: remove after launch — quick access to Waze + Fire desk */}
            <a
              href="/dashboard"
              className="rounded-md border border-cobalt/30 bg-white px-3 py-2 text-xs font-semibold text-cobalt no-underline hover:bg-ink"
            >
              Live desk
            </a>
            <a
              href={STRIPE_CHECKOUT_URL}
              className="hidden rounded-md bg-sky px-4 py-2 text-sm font-semibold text-white no-underline hover:brightness-105 sm:inline"
            >
              Get the App
            </a>
            <AuthControls />
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-5xl flex-col justify-center px-5 pb-16 pt-8 md:pt-4">
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-cobalt md:text-6xl lg:text-7xl">
            Monitor Every Incident in Real-Time.
          </h1>
          <p className="mt-6 max-w-2xl text-lg font-normal leading-relaxed text-gray-600 md:text-xl">
            Instantly track accidents, collisions, and road hazards across your preferred zones.
            Effortless management with a clean, lightning-fast interface.
          </p>
          <div className="mt-10">
            <a
              href={STRIPE_CHECKOUT_URL}
              className="inline-flex rounded-md bg-sky px-8 py-3.5 text-base font-semibold text-white no-underline shadow-none hover:brightness-105"
            >
              Get the App
            </a>
          </div>

          <ul className="mt-16 max-w-xl space-y-6 border-t border-line pt-10" aria-label="Navigation options">
            {NAV_FEATURES.map((feature) => (
              <li key={feature.name} className="flex gap-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky" aria-hidden />
                <div>
                  <p className="text-base font-semibold text-cobalt">{feature.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
