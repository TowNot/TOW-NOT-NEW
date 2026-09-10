import { AuthControls } from "../components/AuthControls";
import { SiteFooter } from "../components/SiteFooter";
import { mailtoSupport, SUPPORT_EMAIL } from "../lib/contactEmail";

const COVERAGE_MAILTO = mailtoSupport(
  "AlertNav coverage request",
  [
    "Hi AlertNav team,",
    "",
    "I'd like coverage added for:",
    "",
    "Area name:",
    "Coordinates (required — latitude, longitude):",
    "Notes (optional):",
    "",
    "Tip: In Google Maps, long-press / right-click to drop a pin, then copy the coordinates shown.",
    "",
  ].join("\n"),
);

function PageHeader(_props: { isSignedIn?: boolean }) {
  return (
    <header className="landing-header">
      <div className="landing-header-inner mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-5 sm:py-5">
        <a
          href="/"
          className="header-logo shrink-0 text-2xl font-bold tracking-tight no-underline sm:text-3xl"
        >
          AlertNav
        </a>
        <AuthControls variant="dark" />
      </div>
    </header>
  );
}

export function RequestCoveragePage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <div className="landing-shell min-h-screen text-white" style={{ backgroundColor: "#0f172a" }}>
      <PageHeader isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-5 sm:py-16">
        <div className="hero-panel relative px-6 py-8 sm:px-10 sm:py-12">
          <div className="landing-hero-glow landing-hero-glow-a opacity-60" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-b opacity-40" aria-hidden />

          <p className="section-label text-indigo-200/80">Request coverage</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Want an area added?
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-indigo-100/80 sm:text-lg">
            Need a country road, a small highway outside your city, or another city or town on
            AlertNav? Email us the details — we aim to add it within 24 hours.
          </p>

          <article className="landing-step-card mt-10 p-5 text-left sm:p-6">
            <h2 className="text-lg font-bold text-white">What to include in your email</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-indigo-100/75">
              <li>
                <strong className="text-white">Area name</strong> — e.g. Highway 6 near Freelton, or
                a town name
              </li>
              <li>
                <strong className="text-white">Coordinates</strong> — required so we cover the right
                spot (latitude, longitude)
              </li>
              <li>
                <strong className="text-white">Optional notes</strong> — anything else that helps
                (stretch of road, nearby landmarks)
              </li>
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-indigo-100/70">
              How to get coordinates: open Google Maps, long-press (phone) or right-click (computer)
              to drop a pin on the area, then copy the numbers shown — they look like{" "}
              <span className="whitespace-nowrap text-indigo-100/90">43.1234, -79.5678</span>.
            </p>
            <a
              href={COVERAGE_MAILTO}
              className="btn-secondary mt-6 inline-flex w-full items-center justify-center px-5 py-2.5 text-sm no-underline sm:w-auto"
            >
              Email a coverage request
            </a>
          </article>

          <p className="mt-8 text-center text-sm text-indigo-100/60">
            Tapping the button opens your email app with{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-indigo-200 underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            already filled in — nothing is sent until you hit send.
          </p>
        </div>

        <p className="mt-8 text-center">
          <a href="/" className="text-sm font-medium text-indigo-200/80 no-underline hover:text-white">
            ← Back to home
          </a>
        </p>
      </main>

      <SiteFooter dark />
    </div>
  );
}
