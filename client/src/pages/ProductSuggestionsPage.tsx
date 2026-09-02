import { UserButton } from "@clerk/clerk-react";
import { SiteFooter } from "../components/SiteFooter";
import { accountPortalUrl } from "../lib/clerkPortal";
import { mailtoSupport, SUPPORT_EMAIL } from "../lib/contactEmail";
import { isClerkConfigured } from "../lib/clerkKey";

const SUGGESTION_MAILTO = mailtoSupport(
  "AlertNav product suggestion",
  "Hi AlertNav team,\n\nI have an idea that could improve the app:\n\n",
);

const QUESTION_MAILTO = mailtoSupport(
  "AlertNav question",
  "Hi AlertNav team,\n\nI have a question about AlertNav:\n\n",
);

function PageHeader({ isSignedIn }: { isSignedIn?: boolean }) {
  return (
    <header className="landing-header">
      <div className="landing-header-inner mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-5 sm:py-5">
        <a
          href="/"
          className="header-logo shrink-0 text-2xl font-bold tracking-tight no-underline sm:text-3xl"
        >
          AlertNav
        </a>
        {isSignedIn && isClerkConfigured() ? (
          <UserButton afterSignOutUrl="/" />
        ) : (
          <a
            href={accountPortalUrl("sign-in")}
            className="btn-auth-light inline-flex min-h-[2.25rem] items-center justify-center px-4 py-2 text-xs no-underline"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}

export function ProductSuggestionsPage({ isSignedIn = false }: { isSignedIn?: boolean }) {
  return (
    <div className="landing-shell min-h-screen text-white" style={{ backgroundColor: "#0f172a" }}>
      <PageHeader isSignedIn={isSignedIn} />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-5 sm:py-16">
        <div className="hero-panel relative px-6 py-8 sm:px-10 sm:py-12">
          <div className="landing-hero-glow landing-hero-glow-a opacity-60" aria-hidden />
          <div className="landing-hero-glow landing-hero-glow-b opacity-40" aria-hidden />

          <p className="section-label text-indigo-200/80">Product feedback</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Suggestions &amp; questions
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-indigo-100/80 sm:text-lg">
            AlertNav is built for dispatchers and drivers who rely on it every day. If you have an
            idea for a new feature, a refinement to the live desk, or a question about your account,
            we want to hear from you. We review every message and do our best to act on feedback
            that helps the community.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <article className="landing-step-card flex flex-col p-5 text-left sm:p-6">
              <h2 className="text-lg font-bold text-white">Product suggestion</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-indigo-100/70">
                Share a feature request, improvement, or workflow idea. Tell us what problem you are
                trying to solve and how AlertNav could help.
              </p>
              <a
                href={SUGGESTION_MAILTO}
                className="btn-secondary mt-5 inline-flex w-full items-center justify-center px-5 py-2.5 text-sm no-underline"
              >
                Email a suggestion
              </a>
            </article>

            <article className="landing-step-card flex flex-col p-5 text-left sm:p-6">
              <h2 className="text-lg font-bold text-white">Question</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-indigo-100/70">
                Billing, coverage zones, notifications, or anything else about your subscription or
                the app — send us a note and we will get back to you by email.
              </p>
              <a
                href={QUESTION_MAILTO}
                className="btn-outline-cobalt mt-5 inline-flex w-full items-center justify-center px-5 py-2.5 text-sm no-underline"
              >
                Email a question
              </a>
            </article>
          </div>

          <p className="mt-8 text-center text-sm text-indigo-100/60">
            Tapping a button opens your email app with{" "}
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
