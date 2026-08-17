import type { HealthStatus, PushReceipt } from "../types";

interface HeaderProps {
  connected: boolean;
  health: HealthStatus | null;
  alertsEnabled: boolean;
  onToggleAlerts: () => void;
  onTogglePush: () => Promise<void>;
  pushEnabled: boolean;
  pushEnableBusy: boolean;
  onTestPush: () => Promise<void>;
  pushBusy: boolean;
  lastPush: PushReceipt | null;
  pushError: string | null;
}

export function Header({
  connected,
  health,
  alertsEnabled,
  onToggleAlerts,
  onTogglePush,
  pushEnabled,
  pushEnableBusy,
  onTestPush,
  pushBusy,
  lastPush,
  pushError,
}: HeaderProps) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-ink font-mono text-sm font-semibold tracking-widest text-fire">
            T2
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">TowNot 2</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-500">
              London, ON · live incident desk
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2" aria-label="Alerts">
          <StatusChip
            live={connected && health?.status === "ok"}
            label={connected ? "feed live" : "feed offline"}
          />
          <button
            type="button"
            onClick={onToggleAlerts}
            className={`rounded-md border px-3 py-2 text-xs font-medium tracking-wide ${
              alertsEnabled
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-line bg-panel text-gray-700 hover:border-gray-400"
            }`}
          >
            {alertsEnabled ? "Audio alerts on" : "Enable audio alerts"}
          </button>
          <button
            type="button"
            onClick={() => void onTogglePush()}
            disabled={pushEnableBusy}
            aria-pressed={pushEnabled}
            className={`rounded-md border px-3 py-2 text-xs font-semibold tracking-wide disabled:opacity-60 ${
              pushEnabled
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-line bg-panel text-gray-800 hover:border-gray-400"
            }`}
          >
            {pushEnableBusy
              ? pushEnabled
                ? "Turning off…"
                : "Enabling…"
              : pushEnabled
                ? "Push notifications on"
                : "Enable Push Notifications"}
          </button>
          <button
            type="button"
            onClick={() => void onTestPush()}
            disabled={pushBusy}
            className="rounded-md bg-fire px-3 py-2 text-xs font-semibold tracking-wide text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {pushBusy ? "Sending…" : "Send Test Push Notification"}
          </button>
        </nav>
      </div>
      {(lastPush || pushError) && (
        <div className="border-t border-line px-5 py-2 text-center font-mono text-[11px] text-gray-500">
          {pushError
            ? `Push failed: ${pushError}`
            : `Test push sent · ${lastPush?.payload.title} · ${lastPush?.id}`}
        </div>
      )}
    </header>
  );
}

function StatusChip({ live, label }: { live: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-ink px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-gray-600">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-maps" : "bg-gray-400"}`} />
      {label}
    </span>
  );
}
