import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PUSH_ZONE_MODE,
  DEFAULT_ZONE_ID,
  readLocalPushZoneMode,
  readLocalZoneId,
  syncProgressierPushTags,
} from "../lib/zones";

const LOAD_TIMEOUT_MS = 8_000;
const SUBSCRIBE_SETTLE_MS = 500;

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

function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

/** The browser's push subscription is the only reliable source of truth. */
async function getSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function syncZoneTags(): void {
  const zoneId = readLocalZoneId() ?? DEFAULT_ZONE_ID;
  const mode = readLocalPushZoneMode() ?? DEFAULT_PUSH_ZONE_MODE;
  syncProgressierPushTags(zoneId, mode);
}

export function useProgressier() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pushSupported()) {
      setEnabled(false);
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      // Permission revoked in browser settings leaves a stale subscription.
      setEnabled(false);
      return;
    }
    try {
      const subscription = await getSubscription();
      setEnabled(Boolean(subscription));
      if (subscription && window.progressier) {
        syncZoneTags();
      }
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Permission and subscription can change in browser settings while the
    // app sits in the background, so re-read on the way back in.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const enablePush = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!pushSupported()) {
        throw new Error("This browser does not support push notifications");
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        throw new Error("Notifications are blocked — re-allow them in browser settings");
      }

      const progressier = await waitForProgressier();
      await progressier.subscribe();

      // subscribe() resolves before the subscription is registered, so settle
      // briefly and then confirm against the PushManager rather than assuming.
      await new Promise((resolve) => setTimeout(resolve, SUBSCRIBE_SETTLE_MS));
      syncZoneTags();
      const subscription = await getSubscription();
      if (!subscription) {
        throw new Error("Push subscription was not created — check notification permissions");
      }
      setEnabled(true);
    } catch (caught) {
      setEnabled(false);
      setError(caught instanceof Error ? caught.message : "Unable to enable push notifications");
    } finally {
      setBusy(false);
    }
  }, []);

  const disablePush = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await getSubscription();
      if (subscription) await subscription.unsubscribe();
      setEnabled(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to turn off push notifications");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const togglePush = useCallback(async () => {
    if (busy) return;
    if (enabled) {
      await disablePush();
      return;
    }
    await enablePush();
  }, [busy, disablePush, enabled, enablePush]);

  return { busy, enabled, error, enablePush, disablePush, togglePush };
}
