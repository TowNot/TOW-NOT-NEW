import { useEffect } from "react";

interface TowNotAlertMessage {
  type?: string;
  title?: string;
  body?: string;
}

/**
 * Plays the dispatch tone when the service worker receives a push while the
 * app is open, so an operator watching the board hears the same signature
 * sound as a backgrounded device notification.
 */
export function usePushAlertBridge(play: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as TowNotAlertMessage | null;
      if (data?.type === "tow-not-alert") play();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [play, enabled]);
}
