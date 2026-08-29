import { usePoliceAlertsPreference } from "../hooks/usePoliceAlertsPreference";

interface PoliceAlertsSettingsProps {
  enabled: boolean;
  onToggle: () => void;
}

/** Desk preference: opt into Waze police pins + Progressier police pushes. */
export function PoliceAlertsSettings({ enabled, onToggle }: PoliceAlertsSettingsProps) {
  return (
    <section className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Police Alerts</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Waze police presence — pins and pushes labeled AlertNav · Waze (Police)
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={
            enabled
              ? "rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-waze"
              : "rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 hover:border-gray-400"
          }
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
    </section>
  );
}

/** Convenience wrapper when the parent does not need the preference value. */
export function PoliceAlertsSettingsConnected() {
  const { enabled, togglePoliceAlerts } = usePoliceAlertsPreference();
  return <PoliceAlertsSettings enabled={enabled} onToggle={togglePoliceAlerts} />;
}
