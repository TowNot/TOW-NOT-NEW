import { resolveStripeCheckoutUrl } from "../lib/stripeCheckout";
import type { HealthStatus } from "../types";
import { AuthControls } from "./AuthControls";

interface HeaderProps {
  connected: boolean;
  health: HealthStatus | null;
}

const STRIPE_CHECKOUT_URL = resolveStripeCheckoutUrl();

export function Header({ connected, health }: HeaderProps) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-2xl font-bold tracking-tight text-cobalt no-underline">
            AlertNav
          </a>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray-500">
              London, ON · live incident desk
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2" aria-label="Status">
          <StatusChip
            live={connected && health?.status === "ok"}
            label={connected ? "feed live" : "feed offline"}
          />
          <StatusChip live label="Push Notifications: Active" />
          <a
            href={STRIPE_CHECKOUT_URL}
            className="inline-flex items-center rounded-md bg-sky px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-white no-underline hover:brightness-105"
          >
            Upgrade
          </a>
          <AuthControls />
        </nav>
      </div>
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
