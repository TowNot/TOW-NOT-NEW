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
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="header-logo text-2xl font-bold tracking-tight no-underline">
            AlertNav
          </a>
          <div>
            <p className="header-tagline text-[11px] font-semibold uppercase tracking-[0.18em]">
              Community traffic &amp; road safety
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2" aria-label="Status">
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

function StatusChip({ live, label }: { live: boolean; label: string }) {
  return (
    <span className="header-chip header-chip-dark header-chip-live gap-2 rounded-full text-[11px] font-semibold uppercase tracking-widest">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${live ? "bg-accent shadow-[0_0_8px_rgba(34,211,238,0.8)]" : "bg-gray-500"}`}
      />
      <span>{label}</span>
    </span>
  );
}
