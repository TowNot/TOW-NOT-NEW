import { useCallback, useState } from "react";
import { Header } from "./components/Header";
import { IncidentFeed } from "./components/IncidentFeed";
import { useAlertOnNewIncidents } from "./hooks/useAlertOnNewIncidents";
import { useAudioAlert } from "./hooks/useAudioAlert";
import { useIncidents } from "./hooks/useIncidents";
import { useProgressier } from "./hooks/useProgressier";
import { usePushAlertBridge } from "./hooks/usePushAlertBridge";
import type { PushReceipt } from "./types";

export default function App() {
  const { incidents, connected, health } = useIncidents();
  const { enabled, enable, disable, play } = useAudioAlert();
  const {
    busy: pushEnableBusy,
    enabled: pushEnabled,
    error: progressierError,
    togglePush,
  } = useProgressier();
  const [pushBusy, setPushBusy] = useState(false);
  const [lastPush, setLastPush] = useState<PushReceipt | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useAlertOnNewIncidents(incidents, play, enabled);
  usePushAlertBridge(play);

  const onToggleAlerts = useCallback(() => {
    if (enabled) disable();
    else void enable();
  }, [disable, enable, enabled]);

  const onTestPush = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const body = (await response.json()) as { receipt?: PushReceipt; error?: string };
      if (!response.ok || !body.receipt) {
        throw new Error(body.error ?? "Test push failed");
      }
      setLastPush(body.receipt);
      // No local tone here: the delivered notification is the sound.
    } catch (error) {
      setPushError(error instanceof Error ? error.message : "Test push failed");
    } finally {
      setPushBusy(false);
    }
  }, []);

  return (
    <div className="radar-grid min-h-screen">
      <Header
        connected={connected}
        health={health}
        alertsEnabled={enabled}
        onToggleAlerts={onToggleAlerts}
        onTogglePush={togglePush}
        pushEnabled={pushEnabled}
        pushEnableBusy={pushEnableBusy}
        onTestPush={onTestPush}
        pushBusy={pushBusy}
        lastPush={lastPush}
        pushError={progressierError ?? pushError}
      />
      <IncidentFeed incidents={incidents} />
    </div>
  );
}
