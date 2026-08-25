import type { HealthStatus } from "../types";
import type { ZoneId } from "../lib/zones";
import { AuthControls } from "./AuthControls";
import { ZoneSwitcher } from "./ZoneSwitcher";

interface HeaderProps {
  connected: boolean;
  health: HealthStatus | null;
  zoneId: ZoneId;
  onZoneChange: (id: ZoneId) => void;
}

export function Header({ connected, health, zoneId, onZoneChange }: HeaderProps) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-2xl font-bold tracking-tight text-cobalt no-underline">
            AlertNav
          </a>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              Live incident desk
            </p>
          </div>
          {/* Static placeholder only — no weather API or scraper. */}
          <StaticRoadWeatherIndicator />
        </div>

        <nav className="flex flex-wrap items-center gap-2" aria-label="Status">
          <ZoneSwitcher value={zoneId} onChange={onZoneChange} />
          <StatusChip
            live={connected && health?.status === "ok"}
            label={connected ? "feed live" : "feed offline"}
          />
          <AuthControls />
        </nav>
      </div>
    </header>
  );
}

/** Decorative road-conditions cue; not wired to live data. */
function StaticRoadWeatherIndicator() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink px-2.5 py-1.5 text-gray-400"
      title="Road conditions — coming soon"
      aria-label="Road conditions placeholder"
      role="img"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] sm:inline">
        Roads
      </span>
    </span>
  );
}

function StatusChip({ live, label }: { live: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-ink px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-gray-600">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-maps" : "bg-gray-400"}`} />
      {label}
    </span>
  );
}
