import { useCallback, useEffect, useRef, useState } from "react";

export function useAudioAlert(src = "/sounds/dispatch_alert.mp3") {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);

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
    const audio = audioRef.current;
    if (audio) {
      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Autoplay may still be blocked until the next gesture; chime uses AudioContext.
      }
    }
  }, []);

  const enable = useCallback(async () => {
    await unlock();
    setEnabled(true);
  }, [unlock]);

  const disable = useCallback(() => {
    setEnabled(false);
    audioRef.current?.pause();
  }, []);

  const playChime = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    const tone = (frequency: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = frequency;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    // TOW-NOT dispatch signature: three two-tone pulses, deliberately unlike
    // a generic notification ping so an emergency tow alert is recognizable
    // without looking at the screen.
    for (const offset of [0, 0.36, 0.72]) {
      tone(740, now + offset, 0.16);
      tone(988, now + offset + 0.17, 0.17);
    }
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    }
    playChime();
  }, [enabled, playChime]);

  return { enabled, enable, disable, play };
}
