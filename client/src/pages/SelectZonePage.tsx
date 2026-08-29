import { useState } from "react";
import { AuthControls } from "../components/AuthControls";
import { useSelectedZone, type ZoneUser } from "../hooks/useSelectedZone";
import { selectableCoverageZones, type ZoneId } from "../lib/zones";

export function SelectZonePage({ user }: { user?: ZoneUser | null }) {
  const { saveZone } = useSelectedZone(user);
  const [busy, setBusy] = useState<ZoneId | null>(null);
  const zones = selectableCoverageZones();

  const onSelect = async (id: ZoneId) => {
    setBusy(id);
    try {
      await saveZone(id);
      window.location.assign("/dashboard");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-shell min-h-screen overflow-x-clip">
      <header className="app-header">
        <div className="mx-auto flex max-w-5xl min-w-0 items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <a href="/" className="header-logo text-xl font-bold tracking-tight no-underline sm:text-2xl">
            AlertNav
          </a>
          <AuthControls variant="dark" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl min-w-0 px-4 py-8 sm:px-5 sm:py-12 md:py-16">
        <p className="section-label">Get started</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          Choose your coverage zone
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
          Alerts and the live map will focus on the city you pick. You can switch anytime from the
          dashboard.
        </p>

        <ul className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {zones.map((zone) => (
            <li key={zone.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onSelect(zone.id)}
                className="surface-card flex h-full w-full min-w-0 flex-col p-4 text-left transition disabled:opacity-60 sm:p-5"
              >
                <span className="text-lg font-bold text-brand sm:text-xl">{zone.name}</span>
                <span className="mt-1 text-sm text-muted">{zone.region}</span>
                <span className="mt-4 text-sm font-semibold text-accent-deep sm:mt-6">
                  {busy === zone.id ? "Saving…" : "Select zone"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
