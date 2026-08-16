import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  claimIncidentAlert,
  markPushAlerted,
  resetDispatchAlerts,
  scheduleIncidentAlert,
} from "../src/lib/dispatchAlerts";

const AFTER_RACE_WINDOW_MS = 2_000;

async function run(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    resetDispatchAlerts();
    await fn();
    console.error(`PASS  ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    return false;
  }
}

const results: boolean[] = [];

results.push(
  await run("live-feed incident plays the dispatch tone once", async () => {
    let plays = 0;
    scheduleIncidentAlert("waze:abc", () => plays++);
    await delay(AFTER_RACE_WINDOW_MS);
    assert.equal(plays, 1);
  }),
);

results.push(
  await run("a backgrounded push cancels the in-app tone", async () => {
    let plays = 0;
    scheduleIncidentAlert("waze:abc", () => plays++);
    await delay(200); // push lands while the tone is still queued
    markPushAlerted("waze:abc");
    await delay(AFTER_RACE_WINDOW_MS);
    assert.equal(plays, 0, "device notification already announced this incident");
  }),
);

results.push(
  await run("a foreground push sounds the siren exactly once", async () => {
    let plays = 0;
    scheduleIncidentAlert("waze:abc", () => plays++);
    await delay(200);
    // App is visible, so the push claims the incident and plays the siren
    // itself instead of letting the queued feed tone fire too.
    if (claimIncidentAlert("waze:abc")) plays++;
    await delay(AFTER_RACE_WINDOW_MS);
    assert.equal(plays, 1);
  }),
);

results.push(
  await run("a claim after the tone already played does not repeat it", async () => {
    let plays = 0;
    scheduleIncidentAlert("waze:late", () => plays++);
    await delay(AFTER_RACE_WINDOW_MS); // tone fires first
    if (claimIncidentAlert("waze:late")) plays++;
    assert.equal(plays, 1);
  }),
);

results.push(
  await run("a push that arrives first suppresses the tone entirely", async () => {
    let plays = 0;
    markPushAlerted("fire-dispatch-42.98,-81.24");
    scheduleIncidentAlert("fire-dispatch-42.98,-81.24", () => plays++);
    await delay(AFTER_RACE_WINDOW_MS);
    assert.equal(plays, 0);
  }),
);

results.push(
  await run("repeated feed updates never stack tones for one incident", async () => {
    let plays = 0;
    for (let i = 0; i < 5; i++) scheduleIncidentAlert("waze:dup", () => plays++);
    await delay(AFTER_RACE_WINDOW_MS);
    scheduleIncidentAlert("waze:dup", () => plays++);
    await delay(AFTER_RACE_WINDOW_MS);
    assert.equal(plays, 1);
  }),
);

results.push(
  await run("separate incidents each get their own tone", async () => {
    let plays = 0;
    scheduleIncidentAlert("waze:one", () => plays++);
    scheduleIncidentAlert("waze:two", () => plays++);
    await delay(AFTER_RACE_WINDOW_MS);
    assert.equal(plays, 2);
  }),
);

resetDispatchAlerts();
const failures = results.filter((ok) => !ok).length;
console.error(failures === 0 ? "\nAll dispatch alert checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
