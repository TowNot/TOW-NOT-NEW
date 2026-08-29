import { useState } from "react";
import { SiteFooter } from "../components/SiteFooter";

const APP_DESCRIPTION =
  "AlertNav is a community-driven traffic and road safety app that notifies users about nearby disruptions to help them better prepare for their commute and stay aware of local road conditions.";

type DesignOption = "a" | "b" | "c";
type Screen = "home" | "alerts";

const OPTIONS: { id: DesignOption; name: string; tagline: string }[] = [
  {
    id: "a",
    name: "Option A — Clean & Organized",
    tagline: "Grouped filters, hero card, stat accents — applied to your live pages",
  },
  {
    id: "b",
    name: "Option B — Command Center",
    tagline: "Sidebar filters, dense metrics, dashboard-first layout",
  },
  {
    id: "c",
    name: "Option C — Spacious & Editorial",
    tagline: "Large type, airy whitespace, magazine-style landing",
  },
];

/** Static design comparison only — no API, hooks, or backend logic. */
export function DesignPreviewPage() {
  const [option, setOption] = useState<DesignOption>("a");
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cobalt">
                Design preview · testing only
              </p>
              <h1 className="text-lg font-bold text-gray-900">Pick a direction for AlertNav</h1>
            </div>
            <a
              href="/"
              className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-gray-600 no-underline hover:text-cobalt"
            >
              ← Back to live app
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOption(item.id)}
                className={
                  option === item.id
                    ? "rounded-full bg-cobalt px-4 py-2 text-xs font-semibold text-white"
                    : "rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-gray-600"
                }
              >
                {item.name}
              </button>
            ))}
          </div>

          <p className="text-sm text-gray-600">{OPTIONS.find((o) => o.id === option)?.tagline}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScreen("home")}
              className={
                screen === "home"
                  ? "rounded-full bg-green px-4 py-2 text-xs font-semibold text-white"
                  : "rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-gray-600"
              }
            >
              Home screen
            </button>
            <button
              type="button"
              onClick={() => setScreen("alerts")}
              className={
                screen === "alerts"
                  ? "rounded-full bg-green px-4 py-2 text-xs font-semibold text-white"
                  : "rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-gray-600"
              }
            >
              Road alerts screen
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {screen === "home" ? (
          <HomeMock option={option} />
        ) : (
          <AlertsMock option={option} />
        )}
      </div>
    </div>
  );
}

function HomeMock({ option }: { option: DesignOption }) {
  if (option === "b") return <HomeCommandCenter />;
  if (option === "c") return <HomeEditorial />;
  return <HomeClean />;
}

function AlertsMock({ option }: { option: DesignOption }) {
  if (option === "b") return <AlertsCommandCenter />;
  if (option === "c") return <AlertsEditorial />;
  return <AlertsClean />;
}

function HomeClean() {
  return (
    <div className="page-shell overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
      <MockHeader compact />
      <div className="px-6 pb-8 pt-6 md:px-10">
        <section className="hero-panel px-6 py-8 md:px-8">
          <p className="section-label text-cobalt">Community traffic &amp; road safety</p>
          <h2 className="text-3xl font-bold text-cobalt md:text-4xl">Stay ahead of nearby road disruptions</h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-600 md:text-base">{APP_DESCRIPTION}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="btn-primary px-6 py-2.5 text-sm">Get the App</span>
            <span className="rounded-full border border-cobalt/20 bg-white px-6 py-2.5 text-sm font-semibold text-cobalt">
              View road alerts
            </span>
          </div>
        </section>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {["Waze", "Google Maps", "Community alerts"].map((name, i) => (
            <div key={name} className="feature-card">
              <span className={`inline-block h-2 w-2 rounded-full ${i === 1 ? "bg-green" : "bg-cobalt"}`} />
              <p className="mt-2 font-bold text-cobalt">{name}</p>
              <p className="mt-1 text-xs text-gray-500">Tap through to navigation apps.</p>
            </div>
          ))}
        </div>
        <MockFooter />
      </div>
    </div>
  );
}

function HomeCommandCenter() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#0f172a] text-white shadow-lg">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <span className="text-2xl font-bold text-white">AlertNav</span>
        <span className="rounded-full bg-green px-4 py-1.5 text-xs font-semibold">Get the App</span>
      </div>
      <div className="grid gap-0 md:grid-cols-[1fr_320px]">
        <div className="px-8 py-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-green">Live road intelligence</p>
          <h2 className="mt-3 text-4xl font-bold leading-tight">Know before you go.</h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300">{APP_DESCRIPTION}</p>
          <div className="mt-8 flex gap-6">
            <div>
              <p className="text-3xl font-bold text-green">3</p>
              <p className="text-xs text-slate-400">Active sources</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">24/7</p>
              <p className="text-xs text-slate-400">Community updates</p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 bg-white/5 p-6 md:border-l md:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Quick links</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="rounded-lg bg-white/10 px-3 py-2">Road alerts dashboard</li>
            <li className="rounded-lg px-3 py-2 text-slate-400">Terms &amp; Conditions</li>
            <li className="rounded-lg px-3 py-2 text-slate-400">Privacy Policy</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function HomeEditorial() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
      <MockHeader minimal />
      <div className="px-8 py-12 text-center md:px-16 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-green">AlertNav</p>
        <h2 className="mx-auto mt-6 max-w-2xl text-5xl font-bold leading-[1.05] tracking-tight text-cobalt md:text-6xl">
          Community-driven traffic &amp; road safety
        </h2>
        <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-gray-600">{APP_DESCRIPTION}</p>
        <div className="mt-10 flex justify-center gap-3">
          <span className="btn-primary px-10 py-4 text-base">Get the App</span>
        </div>
      </div>
      <div className="border-t border-line px-8 py-6 text-center text-xs text-gray-500">
        Terms · Privacy · Refund Policy · Disclaimer · Acceptable Use
      </div>
    </div>
  );
}

function AlertsClean() {
  return (
    <div className="page-shell overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
      <MockHeader withStatus />
      <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
        <MockSettingsCard title="Police Alerts" />
        <MockSettingsCard title="SMS alerts" />
      </div>
      <div className="px-5 pb-6">
        <div className="filter-panel">
          <p className="section-label">Data sources</p>
          <MockPills row={["Waze", "Google Maps", "Fire", "EMS"]} active={[0, 1, 2]} />
          <div className="mt-5 border-t border-line pt-5">
            <p className="section-label">Alert types</p>
            <MockPills row={["Accidents", "Incidents"]} active={[0, 1]} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MockStat label="Waze traffic" value="3" accent="cobalt" />
          <MockStat label="Google Maps" value="2" accent="green" />
          <MockStat label="London Fire" value="1" accent="fire" />
          <MockStat label="EMS" value="—" muted />
        </div>
        <MockFeedHeader count={4} />
        <MockIncidentCard />
      </div>
    </div>
  );
}

function AlertsCommandCenter() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
      <MockHeader withStatus dark />
      <div className="grid md:grid-cols-[240px_1fr]">
        <aside className="border-b border-line bg-slate-50 p-4 md:border-b-0 md:border-r">
          <p className="section-label">Filters</p>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Sources</p>
          <div className="mt-2 space-y-1">
            {["Waze", "Google Maps", "Fire", "EMS"].map((label, i) => (
              <div
                key={label}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${i < 3 ? "bg-cobalt-soft text-cobalt" : "text-gray-400"}`}
              >
                {label}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Alert types</p>
          <div className="mt-2 space-y-1">
            <div className="rounded-lg bg-cobalt-soft px-3 py-2 text-xs font-semibold text-cobalt">Accidents</div>
            <div className="rounded-lg bg-green-soft px-3 py-2 text-xs font-semibold text-green-dark">Incidents</div>
          </div>
        </aside>
        <main className="p-4">
          <div className="grid grid-cols-4 gap-2">
            <MockStat label="Waze" value="3" compact accent="cobalt" />
            <MockStat label="Maps" value="2" compact accent="green" />
            <MockStat label="Fire" value="1" compact accent="fire" />
            <MockStat label="EMS" value="—" compact muted />
          </div>
          <MockFeedHeader count={4} />
          <MockIncidentCard compact />
          <MockIncidentCard compact />
        </main>
      </div>
    </div>
  );
}

function AlertsEditorial() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
      <MockHeader withStatus minimal />
      <div className="px-8 py-8">
        <h2 className="text-3xl font-bold text-cobalt">Nearby disruptions</h2>
        <p className="mt-2 text-sm text-gray-500">London · Community road alerts</p>
        <div className="mt-8 flex flex-wrap gap-2">
          <MockPills row={["Waze", "Google Maps", "Fire", "Accidents", "Incidents"]} active={[0, 1, 2, 3, 4]} />
        </div>
        <div className="mt-10 space-y-6">
          <MockIncidentCard editorial />
          <MockIncidentCard editorial />
        </div>
      </div>
    </div>
  );
}

function MockHeader({
  compact,
  minimal,
  withStatus,
  dark,
}: {
  compact?: boolean;
  minimal?: boolean;
  withStatus?: boolean;
  dark?: boolean;
}) {
  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 ${dark ? "bg-[#0f172a] text-white" : "bg-white"}`}
    >
      <div className="flex items-center gap-3">
        <span className={`text-xl font-bold ${dark ? "text-white" : "text-cobalt"}`}>AlertNav</span>
        {!minimal ? (
          <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-gray-400 sm:inline">
            Community traffic &amp; road safety
          </span>
        ) : null}
      </div>
      {withStatus ? (
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          <span className="rounded-full border border-line px-2 py-1">Zone · London</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green" /> feed live
          </span>
        </div>
      ) : compact ? (
        <span className="rounded-full bg-green px-3 py-1 text-[10px] font-semibold text-white">Get the App</span>
      ) : null}
    </header>
  );
}

function MockFooter() {
  return (
    <div className="mt-8 border-t border-line pt-6">
      <SiteFooter />
    </div>
  );
}

function MockSettingsCard({ title }: { title: string }) {
  return (
    <div className="surface-card px-4 py-3">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-xs text-gray-500">Preference toggle · visual mock only</p>
      <span className="mt-3 inline-block rounded-full border border-line px-3 py-1 text-[10px] font-semibold uppercase">
        Off
      </span>
    </div>
  );
}

function MockPills({ row, active }: { row: string[]; active: number[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {row.map((label, index) => (
        <span
          key={label}
          className={
            active.includes(index)
              ? index % 2 === 0
                ? "pill-active-cobalt px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                : "pill-active-green px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
              : "rounded-full border border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400"
          }
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function MockStat({
  label,
  value,
  accent,
  muted,
  compact,
}: {
  label: string;
  value: string;
  accent?: "cobalt" | "green" | "fire";
  muted?: boolean;
  compact?: boolean;
}) {
  const accentClass =
    accent === "green" ? "stat-green" : accent === "fire" ? "stat-fire" : accent === "cobalt" ? "" : "";
  return (
    <div className={`surface-card stat-card-accent ${accentClass} ${compact ? "px-3 py-2" : "px-4 py-3"} ${muted ? "opacity-50" : ""}`}>
      <p className="text-[9px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`font-bold tabular-nums text-gray-900 ${compact ? "text-xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function MockFeedHeader({ count }: { count: number }) {
  return (
    <div className="mt-6 flex items-end justify-between">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-900">Nearby disruptions</h3>
        <p className="text-xs text-gray-500">Community road alerts · Waze · Google Maps · Fire · EMS</p>
      </div>
      <p className="font-mono text-[11px] text-gray-500">{count} live</p>
    </div>
  );
}

function MockIncidentCard({
  compact,
  editorial,
}: {
  compact?: boolean;
  editorial?: boolean;
}) {
  if (editorial) {
    return (
      <article className="border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill-active-cobalt px-2 py-1 text-[9px] font-semibold uppercase">Waze</span>
          <span className="text-[10px] uppercase tracking-widest text-green-dark">high · alerted</span>
        </div>
        <h4 className="mt-3 text-xl font-bold text-gray-900">Traffic accident</h4>
        <p className="mt-2 text-sm text-gray-600">Multi-vehicle collision · Wellington Rd &amp; Baseline Rd</p>
        <div className="mt-4 h-32 rounded-xl bg-gray-100" aria-label="Map preview placeholder" />
        <p className="mt-3 font-mono text-[11px] text-gray-400">14:39:02 · 42.9378, -81.1794</p>
      </article>
    );
  }

  return (
    <article className={`surface-card mt-4 grid gap-3 p-4 ${compact ? "" : "md:grid-cols-[8rem_1fr_auto]"}`}>
      <div>
        <span className="pill-active-cobalt px-2 py-1 text-[9px] font-semibold uppercase">Waze</span>
        <p className="mt-2 text-[10px] uppercase text-gray-400">high · alerted</p>
      </div>
      <div>
        <div className="mb-2 h-20 w-full max-w-[140px] rounded-lg bg-gray-100" aria-label="Map preview placeholder" />
        <p className="font-semibold text-gray-900">Traffic accident</p>
        <p className="text-xs text-gray-500">Wellington Rd &amp; Baseline Rd, London</p>
      </div>
      {!compact ? (
        <p className="font-mono text-[11px] text-gray-500 md:text-right">14:39:02</p>
      ) : null}
    </article>
  );
}
