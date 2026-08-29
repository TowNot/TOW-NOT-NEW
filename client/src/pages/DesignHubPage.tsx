import { DESIGN_HUB_PATH, designDeskHref, designHomeHref } from "../design/designRoutes";

const OPTIONS = [
  {
    id: "option1" as const,
    name: "Option 1 — Aurora",
    summary: "Dark hero landing · gradient header · collapsible Filters & SMS on the desk",
    home: designHomeHref("option1"),
    desk: designDeskHref("option1"),
    badge: "Saved",
    badgeClass: "bg-indigo-100 text-indigo-800",
  },
  {
    id: "option2" as const,
    name: "Option 2 — Command",
    summary: "Light split landing · sidebar menu desk · dedicated Filters & SMS pages",
    home: designHomeHref("option2"),
    desk: designDeskHref("option2"),
    badge: "Alt",
    badgeClass: "bg-teal-100 text-teal-900",
  },
  {
    id: "option3" as const,
    name: "Option 3 — Pulse",
    summary: "Ultra-minimal dark landing · centered type · pill tabs on the desk",
    home: designHomeHref("option3"),
    desk: designDeskHref("option3"),
    badge: "Alt",
    badgeClass: "bg-sky-100 text-sky-900",
  },
  {
    id: "option4" as const,
    name: "Option 4 — Bloom",
    summary: "Warm bento landing · jump links · numbered Filters → SMS → Feed scroll desk",
    home: designHomeHref("option4"),
    desk: designDeskHref("option4"),
    badge: "Alt",
    badgeClass: "bg-orange-100 text-orange-900",
  },
  {
    id: "option5" as const,
    name: "Option 5 — Lumen",
    summary: "Iridescent glass mesh · gradient hero · floating bottom dock on the desk",
    home: designHomeHref("option5"),
    desk: designDeskHref("option5"),
    badge: "Alt",
    badgeClass: "bg-fuchsia-100 text-fuchsia-900",
  },
  {
    id: "option6" as const,
    name: "Option 6 — Tide",
    summary: "Blue-green radar hero · wave shore section · ocean sidebar desk with mint workspace",
    home: designHomeHref("option6"),
    desk: designDeskHref("option6"),
    badge: "New",
    badgeClass: "bg-emerald-100 text-emerald-900",
  },
];

/** Hub to compare saved design directions (local preview only). */
export function DesignHubPage() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
            Design preview
          </p>
          <h1 className="text-3xl font-bold tracking-tight">AlertNav layout options</h1>
          <p className="max-w-2xl text-stone-600">
            Option 1 is your saved baseline (live app at <a href="/">/</a>). Options 2–6 use the
            same wording with different layouts — try each and pick a direction. Bookmark{" "}
            <a href={DESIGN_HUB_PATH}>{DESIGN_HUB_PATH}</a> or <a href="/designs">/designs</a>.
          </p>
          <a
            href="/"
            className="mt-2 inline-flex w-fit rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 no-underline hover:bg-stone-50"
          >
            ← Back to live app (Option 1)
          </a>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {OPTIONS.map((option) => (
          <article
            key={option.id}
            className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold leading-snug text-stone-900">{option.name}</h2>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${option.badgeClass}`}
              >
                {option.badge}
              </span>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-stone-600">{option.summary}</p>
            <div className="mt-6 flex flex-col gap-2">
              <a
                href={option.home}
                className="inline-flex items-center justify-center rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-stone-800"
              >
                Home page
              </a>
              <a
                href={option.desk}
                className="inline-flex items-center justify-center rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-800 no-underline hover:bg-stone-50"
              >
                Road alerts desk
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
