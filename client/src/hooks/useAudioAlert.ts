import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "audioAlertsEnabled";
// Back-to-back incidents must not overlap into a garbled siren.
const MIN_GAP_MS = 3_000;

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Private browsing or blocked storage: the toggle still works this session.
  }
}

export function useAudioAlert(src = "/sounds/dispatch_alert.mp3") {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const lastPlayedAtRef = useRef(0);
  const [enabled, setEnabled] = useState(readStoredPreference);

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, [src]);

  const unlock = useCallback(async () => {
    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    if (contextRef.current.state === "suspended") {
      await contextRef.current.resume();
    }
  }, []);

  // A restored preference cannot resume audio on its own: browsers only allow
  // that from a user gesture. Arm the context on the first interaction so the
  // toggle survives a reload without the operator re-enabling it.
  useEffect(() => {
    if (!enabled) return;
    if (contextRef.current?.state === "running") return;

    const arm = () => {
      void unlock();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    for (const event of events) {
      window.addEventListener(event, arm, { once: true, passive: true });
    }
    return () => {
      for (const event of events) window.removeEventListener(event, arm);
    };
  }, [enabled, unlock]);

  const enable = useCallback(async () => {
    await unlock();
    setEnabled(true);
    storePreference(true);
  }, [unlock]);

  const disable = useCallback(() => {
    setEnabled(false);
    storePreference(false);
    audioRef.current?.pause();
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastPlayedAtRef.current < MIN_GAP_MS) return;
    lastPlayedAtRef.current = now;

    const ctx = contextRef.current;
    if (!ctx || ctx.state !== "running") {
      // Audio is still locked; the sample element is the only thing that may
      // be allowed to make noise here.
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
      }
      return;
    }

    const start = ctx.currentTime;
    const tone = (frequency: number, offset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
      osc.start(start + offset);
      osc.stop(start + offset + duration + 0.02);
    };

    // TOW-NOT dispatch signature: three two-tone pulses, deliberately unlike a
    // generic notification ping. This is the only sound the app plays — the
    // sample element is a fallback, never a second layer on top of it.
    for (const offset of [0, 0.36, 0.72]) {
      tone(740, offset, 0.16);
      tone(988, offset + 0.17, 0.17);
    }
  }, [enabled]);

  return { enabled, enable, disable, play };
}
