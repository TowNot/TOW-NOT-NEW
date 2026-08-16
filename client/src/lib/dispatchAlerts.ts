/**
 * One sound per incident.
 *
 * An incident can reach the browser twice: over the live SSE feed and again as
 * a push notification. The push already makes the device sound, so the in-app
 * tone must not stack on top of it. The live feed usually wins the race by a
 * second or two, so its tone is scheduled on a short delay and cancelled if a
 * push for the same incident lands first.
 */

const PUSH_RACE_DELAY_MS = 1_500;
const LEDGER_TTL_MS = 10 * 60 * 1000;

const alerted = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function prune(): void {
  const now = Date.now();
  for (const [id, at] of alerted) {
    if (now - at > LEDGER_TTL_MS) alerted.delete(id);
  }
}

/** Records that the OS already announced this incident via a push notification. */
export function markPushAlerted(incidentId: string): void {
  prune();
  alerted.set(incidentId, Date.now());

  const timer = pending.get(incidentId);
  if (timer) {
    clearTimeout(timer);
    pending.delete(incidentId);
  }
}

/** Queues the in-app tone unless the incident has already been announced. */
export function scheduleIncidentAlert(incidentId: string, play: () => void): void {
  prune();
  if (alerted.has(incidentId) || pending.has(incidentId)) return;

  const timer = setTimeout(() => {
    pending.delete(incidentId);
    if (alerted.has(incidentId)) return;
    alerted.set(incidentId, Date.now());
    play();
  }, PUSH_RACE_DELAY_MS);

  pending.set(incidentId, timer);
}

/** Test-only reset so state never leaks between checks. */
export function resetDispatchAlerts(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  alerted.clear();
}
