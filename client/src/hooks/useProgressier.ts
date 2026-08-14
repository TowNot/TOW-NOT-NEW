import { useCallback, useEffect, useState } from "react";

const LOAD_TIMEOUT_MS = 8_000;

async function waitForProgressier(): Promise<ProgressierClient> {
  if (window.progressier) return window.progressier;

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.progressier) {
        window.clearInterval(timer);
        resolve(window.progressier);
        return;
      }
      if (Date.now() - started > LOAD_TIMEOUT_MS) {
        window.clearInterval(timer);
        reject(new Error("Progressier failed to load"));
      }
    }, 50);
  });
}

export function useProgressier() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setEnabled(true);
    }
  }, []);

  const enablePush = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const progressier = await waitForProgressier();
      await progressier.subscribe();
      progressier.add?.({ tags: "tow-not" });
      setEnabled(true);
    } catch (caught) {
      setEnabled(false);
      setError(caught instanceof Error ? caught.message : "Unable to enable push notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, enabled, error, enablePush };
}
