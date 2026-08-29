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
    <header className="app-header">
      <div className="mx-auto flex max-w-6xl min-w-0 flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <a href="/" className="header-logo shrink-0 text-xl font-bold tracking-tight no-underline sm:text-2xl">
            AlertNav
          </a>
          <div className="hidden sm:block">
            <p className="header-tagline text-[11px] font-semibold uppercase tracking-[0.18em]">
              Live incident desk
            </p>
          </div>
          <StaticRoadWeatherIndicator />
        </div>

        <nav className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Status">
          <ZoneSwitcher value={zoneId} onChange={onZoneChange} dark />
          <StatusChip
            live={connected && health?.status === "ok"}
            label={connected ? "feed live" : "feed offline"}
          />
          <AuthControls variant="dark" />
        </nav>
      </div>
    </header>
  );
}

/** Decorative road-conditions cue; not wired to live data. */
function StaticRoadWeatherIndicator() {
  return (
    <span
      className="header-chip header-chip-dark hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-gray-400 sm:inline-flex"
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
    <span className="header-chip header-chip-dark header-chip-live inline-flex items-center gap-2 rounded-full text-[11px] font-semibold uppercase tracking-widest">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${live ? "bg-accent shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-gray-500"}`}
      />
      {label}
    </span>
  );
}
