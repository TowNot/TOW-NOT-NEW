import { useCallback, useEffect, useRef, useState } from "react";
import { createDispatchSiren, DISPATCH_SIREN_URL, type DispatchSiren } from "../lib/playDispatchSiren";

const STORAGE_KEY = "audioAlertsEnabled";

function readStoredPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function storePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Private browsing or blocked storage: the toggle still works this session.
  }
}

export function useAudioAlert(src = DISPATCH_SIREN_URL) {
  const sirenRef = useRef<DispatchSiren | null>(null);
  const [enabled, setEnabled] = useState(readStoredPreference);

  useEffect(() => {
    const siren = createDispatchSiren(src);
    sirenRef.current = siren;
    return () => {
      siren.dispose();
      sirenRef.current = null;
    };
  }, [src]);

  // A restored preference cannot unlock audio on its own: browsers only allow
  // that from a user gesture. Arm the siren on the first interaction so the
  // toggle survives a reload without the operator re-enabling it.
  useEffect(() => {
    if (!enabled) return;

    const arm = () => {
      void sirenRef.current?.unlock();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    for (const event of events) {
      window.addEventListener(event, arm, { once: true, passive: true });
    }
    return () => {
      for (const event of events) window.removeEventListener(event, arm);
    };
  }, [enabled]);

  const enable = useCallback(async () => {
    await sirenRef.current?.unlock();
    setEnabled(true);
    storePreference(true);
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    storePreference(false);
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    sirenRef.current?.play();
  }, [enabled]);

  return { enabled, enable, disable, play };
}
