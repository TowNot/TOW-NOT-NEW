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
    <div className="min-h-screen bg-white text-gray-800">
      <header className="bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
          <a href="/" className="text-3xl font-bold tracking-tight text-cobalt no-underline">
            AlertNav
          </a>
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-green">Get started</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-cobalt md:text-5xl">
          Choose your coverage zone
        </h1>
        <p className="mt-4 max-w-xl text-lg text-gray-600">
          Alerts and the live map will focus on the city you pick. You can switch anytime from the
          dashboard.
        </p>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <li key={zone.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void onSelect(zone.id)}
                className="surface-card flex h-full w-full flex-col p-5 text-left transition hover:border-green/30 disabled:opacity-60"
              >
                <span className="text-xl font-bold text-cobalt">{zone.name}</span>
                <span className="mt-1 text-sm text-gray-500">{zone.region}</span>
                <span className="mt-6 text-sm font-semibold text-green">
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
