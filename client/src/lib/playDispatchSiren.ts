/**
 * The TowNot 2 dispatch siren — the single sound the app makes for an incident.
 *
 * Two playback paths, never both at once:
 *  1. the generated siren asset (client/scripts/generate-dispatch-siren.cjs),
 *     which is the real, recognizable sound;
 *  2. a synthesized two-tone fallback, used when the asset cannot load.
 *
 * Note this only covers the app being open. A web app cannot choose the sound
 * a push notification makes — the Notifications API `sound` property was
 * dropped from the spec in 2018 and no browser implements it, and iOS in
 * particular hands PWA push sounds entirely to the system.
 */

export const DISPATCH_SIREN_URL = "/sounds/dispatch_siren.wav";

/** Back-to-back incidents must not overlap into a garbled siren. */
const MIN_GAP_MS = 3_000;

export interface DispatchSiren {
  /** Must run inside a user gesture before audio is allowed to play. */
  unlock(): Promise<void>;
  play(): void;
  dispose(): void;
}

function synthesize(ctx: AudioContext): void {
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

  // Same low-high warble as the generated asset, so the fallback is
  // recognizably the same alert rather than a different sound.
  for (const offset of [0, 0.44, 0.88]) {
    tone(740, offset, 0.17);
    tone(988, offset + 0.18, 0.17);
  }
}

export function createDispatchSiren(assetUrl = DISPATCH_SIREN_URL): DispatchSiren {
  let context: AudioContext | null = null;
  let element: HTMLAudioElement | null = new Audio(assetUrl);
  let lastPlayedAt = 0;
  element.preload = "auto";

  const unlock = async (): Promise<void> => {
    if (!context) context = new AudioContext();
    if (context.state === "suspended") await context.resume();

    // Priming the element inside the gesture is what lets later, non-gesture
    // playback succeed under autoplay policies.
    if (element) {
      try {
        await element.play();
        element.pause();
        element.currentTime = 0;
      } catch {
        // Still locked; play() will fall back to the synthesized siren.
      }
    }
  };

  const play = (): void => {
    const now = Date.now();
    if (now - lastPlayedAt < MIN_GAP_MS) return;
    lastPlayedAt = now;

    if (element) {
      element.currentTime = 0;
      const started = element.play();
      if (started) {
        started.catch(() => {
          if (context?.state === "running") synthesize(context);
        });
        return;
      }
      return;
    }

    if (context?.state === "running") synthesize(context);
  };

  const dispose = (): void => {
    element?.pause();
    element = null;
    void context?.close();
    context = null;
  };

  return { unlock, play, dispose };
}
