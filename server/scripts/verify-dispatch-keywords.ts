import assert from "node:assert/strict";
import { classifyPriority, findCrashKeywords } from "../src/engine/dispatchKeywords";

const checks: Array<[string, () => void]> = [
  [
    "Engine 7 tractor-trailer into a pole posts even without MVC",
    () => {
      const hits = findCrashKeywords(
        "765 Engine 7, tractor trailer hit the pole, pole is down, wires across the street",
      );
      assert.ok(hits.includes("hit pole"), String(hits));
      assert.ok(hits.includes("tractor trailer"), String(hits));
      assert.ok(hits.includes("pole down"), String(hits));
      assert.ok(
        hits.includes("wires down") || hits.includes("wires across the street"),
        String(hits),
      );
      assert.equal(
        classifyPriority(
          "765 Engine 7, tractor trailer hit the pole, pole is down, wires across the street",
        ),
        "critical",
      );
    },
  ],
  [
    "each listed hazard phrase is enough on its own",
    () => {
      assert.ok(findCrashKeywords("light pole at Highbury").includes("light pole"));
      assert.ok(findCrashKeywords("the pole is down on Wonderland").includes("pole down"));
      assert.ok(
        findCrashKeywords("wires across the street at Oxford").includes(
          "wires across the street",
        ),
      );
      assert.ok(findCrashKeywords("he hit the pole").includes("hit pole"));
      assert.ok(findCrashKeywords("tractor-trailer blocking").includes("tractor trailer"));
      assert.ok(findCrashKeywords("vehicle fire on Highbury").includes("vehicle fire"));
      assert.ok(findCrashKeywords("car fire at Oxford").includes("vehicle fire"));
      assert.ok(findCrashKeywords("truck fire on the 401").includes("vehicle fire"));
      assert.ok(findCrashKeywords("auto fire Wellington and Baseline").includes("vehicle fire"));
    },
  ],
  [
    "routine Engine 7 traffic without crash/hazard language still drops",
    () => {
      assert.deepEqual(findCrashKeywords("Engine 7 responding, medical, chest pain"), []);
      assert.deepEqual(findCrashKeywords("765 calling Engine 7, Engine 7 on scene"), []);
      assert.deepEqual(findCrashKeywords("two vehicles on scene, standby"), []);
    },
  ],
  [
    "classic MVC language is unchanged",
    () => {
      const hits = findCrashKeywords("765 calling Engine 3, MVC Wharncliffe and Oxford, code 4");
      assert.ok(hits.includes("MVC"), String(hits));
    },
  ],
  [
    "code 4 plus a vehicle word posts without MVC",
    () => {
      const hits = findCrashKeywords(
        "Engine 7, Highbury and Oxford, two vehicles, code 4",
      );
      assert.ok(hits.includes("code 4 vehicle") || hits.includes("multi-vehicle"), String(hits));
      assert.equal(
        classifyPriority("Engine 7, Highbury and Oxford, two vehicles, code 4"),
        "critical",
      );
    },
  ],
];

let failures = 0;
for (const [name, run] of checks) {
  try {
    run();
    console.error(`PASS  ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

console.error(
  failures === 0 ? "\nAll dispatch keyword checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
