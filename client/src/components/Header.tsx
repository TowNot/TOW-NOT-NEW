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
    <header className="border-b border-line bg-panel/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-fire/40 bg-fire/10 font-mono text-sm font-medium tracking-widest text-fire">
            TN
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-[0.22em]">TOW-NOT</h1>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
              London, ON · live incident desk
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            live={connected && health?.status === "ok"}
            label={connected ? "feed live" : "feed offline"}
          />
          <button
            type="button"
            onClick={onToggleAlerts}
            className={`rounded-md border px-3 py-2 text-xs font-medium tracking-wide ${
              alertsEnabled
                ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                : "border-line bg-ink text-slate-300 hover:border-slate-500"
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
                ? "border-maps/50 bg-maps/10 text-maps hover:bg-maps/20"
                : "border-fire/50 bg-fire/10 text-fire hover:bg-fire/20"
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
            className="rounded-md bg-fire px-3 py-2 text-xs font-semibold tracking-wide text-ink hover:bg-orange-400 disabled:opacity-60"
          >
            {pushBusy ? "Sending…" : "Send Test Push Notification"}
          </button>
        </div>
      </div>
      {(lastPush || pushError) && (
        <div className="border-t border-line px-5 py-2 text-center font-mono text-[11px] text-slate-400">
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
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-ink px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-300">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-maps animate-pulse" : "bg-slate-600"}`} />
      {label}
    </span>
  );
}
