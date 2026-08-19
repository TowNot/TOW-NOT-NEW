import { Header } from "../components/Header";
import { IncidentFeed } from "../components/IncidentFeed";
import { useAlertOnNewIncidents } from "../hooks/useAlertOnNewIncidents";
import { useIncidents } from "../hooks/useIncidents";
import { useProgressier } from "../hooks/useProgressier";
import { usePushAlertBridge } from "../hooks/usePushAlertBridge";

export function IncidentDesk() {
  const { incidents, connected, health } = useIncidents();
  useProgressier();
  useAlertOnNewIncidents(incidents);
  usePushAlertBridge();

  return (
    <div className="min-h-screen bg-white">
      <Header connected={connected} health={health} />
      <IncidentFeed incidents={incidents} />
    </div>
  );
}
