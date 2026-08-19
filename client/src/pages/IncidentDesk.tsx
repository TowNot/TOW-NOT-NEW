import { Header } from "../components/Header";
import { IncidentFeed } from "../components/IncidentFeed";
import { SmsSettings } from "../components/SmsSettings";
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
      <div className="mx-auto w-full max-w-6xl px-5 pt-6">
        <SmsSettings />
      </div>
      <IncidentFeed incidents={incidents} />
    </div>
  );
}
