import { resolveStripeCheckoutUrl } from "../lib/stripeCheckout";
import { AuthControls } from "../components/AuthControls";

const BENEFITS = [
  {
    index: "01",
    title: "Instant Notifications",
    body: "Be the first to know about local incidents with low-latency browser push notifications.",
  },
  {
    index: "02",
    title: "Live Emergency Feeds",
    body: "Read real-time transcriptions of active fire and emergency dispatch audio.",
  },
  {
    index: "03",
    title: "Traffic & Collision Data",
    body: "See mapped accidents and hazards instantly to avoid delays.",
  },
] as const;

const TRUST = [
  { value: "<1s", label: "Alert latency" },
  { value: "Live", label: "Dispatch audio" },
  { value: "London, ON", label: "Coverage area" },
] as const;

const STRIPE_CHECKOUT_URL = resolveStripeCheckoutUrl();

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="/" className="font-display text-3xl leading-none text-gray-900 no-underline">
            AlertNav
          </a>
          <nav className="flex items-center gap-4 sm:gap-6" aria-label="Primary">
            <a href="#benefits" className="hidden text-sm font-medium text-gray-600 no-underline hover:text-gray-900 sm:inline">
              Why AlertNav
            </a>
            <a
              href={STRIPE_CHECKOUT_URL}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-black"
            >
              Subscribe
            </a>
            <AuthControls />
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gray-500">
            Real-time incident intelligence
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight text-gray-900 md:text-6xl">
            Know About Every Incident and Accident Instantly.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 md:text-xl">
            Get real-time alerts for traffic accidents, fire emergencies, and road hazards the
            second they happen. Engage with meaningful alerts and resolve real issues faster.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href={STRIPE_CHECKOUT_URL}
              className="inline-flex rounded-md bg-gray-900 px-6 py-3 text-base font-semibold text-white no-underline hover:bg-black"
            >
              Subscribe
            </a>
            <a
              href="/desk"
              className="inline-flex rounded-md border border-line bg-white px-6 py-3 text-base font-semibold text-gray-900 no-underline hover:bg-ink"
            >
              Open live desk
            </a>
          </div>
        </section>

        <section className="border-y border-line bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {TRUST.map((item) => (
              <div key={item.label} className="px-5 py-8">
                <p className="text-2xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-gray-500">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="benefits" className="mx-auto max-w-6xl px-5 py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gray-500">
            Built for speed
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-gray-900">
            Awareness in the moment it matters.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <article key={benefit.index} className="rounded-lg border border-line bg-white p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                  {benefit.index}
                </p>
                <h3 className="mt-4 text-xl font-semibold text-gray-900">{benefit.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{benefit.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 md:flex md:items-center md:justify-between">
            <blockquote className="max-w-2xl">
              <p className="text-xl font-medium leading-snug text-gray-900">
                “The feed surfaces collisions and fire calls as they happen — before the radio
                traffic is over.”
              </p>
              <footer className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-gray-500">
                Operations desk · London, ON
              </footer>
            </blockquote>
            <a
              href={STRIPE_CHECKOUT_URL}
              className="mt-8 inline-flex rounded-md bg-gray-900 px-6 py-3 text-base font-semibold text-white no-underline hover:bg-black md:mt-0"
            >
              Upgrade
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg text-gray-900">AlertNav</p>
          <p className="text-xs text-gray-500">London, ON · real-time incident alerts</p>
        </div>
      </footer>
    </div>
  );
}
