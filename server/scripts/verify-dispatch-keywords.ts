import assert from "node:assert/strict";
import {
  classifyPriority,
  findCrashKeywords,
  findNegativeKeywords,
} from "../src/engine/dispatchKeywords";

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
  [
    "elevator / escalator / medical assist / alarm drop even with extricated or accident",
    () => {
      assert.deepEqual(
        findCrashKeywords("Engine 5, person extricated from the elevator, Main and Dundas"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 3, trapped in the escalator at Galleria"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 7, medical assist, accident reported, Oxford Street"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 2, alarm ringing, accident, Wellington and Horton"),
        [],
      );
      assert.ok(findNegativeKeywords("elevators, person extricated").includes("elevator"));
      assert.equal(
        classifyPriority("Engine 5, person extricated from the elevator"),
        "normal",
      );
      assert.ok(findCrashKeywords("MVC Oxford and Highbury, person extricated").includes("MVC"));
    },
  ],
  [
    "blacklist drops lift assist, wellness, CO, and automatic alarm",
    () => {
      assert.deepEqual(
        findCrashKeywords("Engine 4, lift assist, MVC reported Oxford Street"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 2, wellness check, accident on Wellington"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 5, carbon monoxide alarm, accident reported"),
        [],
      );
      assert.deepEqual(findCrashKeywords("Engine 3, CO alarm, collision reported"), []);
      assert.deepEqual(
        findCrashKeywords("Engine 1, automatic alarm, accident at Dundas"),
        [],
      );
      assert.ok(findNegativeKeywords("lift assist requested").includes("lift assist"));
      assert.ok(findNegativeKeywords("wellness check on scene").includes("wellness check"));
    },
  ],
  [
    "pedestrian, ditch, guardrail, jackknife, and pinning phrases post",
    () => {
      assert.ok(findCrashKeywords("pedestrian struck on Oxford").includes("pedestrian struck"));
      assert.ok(findCrashKeywords("ped struck at Highbury").includes("pedestrian struck"));
      assert.ok(findCrashKeywords("vs pedestrian Wonderland").includes("pedestrian struck"));
      assert.ok(findCrashKeywords("patient ejected on the 401").includes("ejected"));
      assert.ok(findCrashKeywords("vehicle overturned on Wellington").includes("overturned"));
      assert.ok(findCrashKeywords("tractor jackknifed on highway").includes("jackknife"));
      assert.ok(findCrashKeywords("into the ditch on Oxford").includes("in the ditch"));
      assert.ok(findCrashKeywords("hit the guardrail on the 401").includes("guardrail"));
      assert.ok(findCrashKeywords("struck a building on Dundas").includes("struck building"));
      assert.ok(findCrashKeywords("pinned in the vehicle at Oxford").includes("vehicle pinning"));
      assert.ok(findCrashKeywords("car is pinning at the intersection").includes("vehicle pinning"));
    },
  ],
  [
    "entrapment, VSBR, spills, cyclist, STT misreads, and blocking lanes post",
    () => {
      assert.ok(findCrashKeywords("patient entrapment on Oxford").includes("entrapment"));
      assert.ok(findCrashKeywords("VSBR at Wellington and Baseline").includes("VSBR"));
      assert.ok(
        findCrashKeywords("vehicle into structure on Dundas").includes("vehicle into structure"),
      );
      assert.ok(findCrashKeywords("fuel spill on the 401").includes("fuel spill"));
      assert.ok(findCrashKeywords("fluid spill blocking Oxford").includes("fluid spill"));
      assert.ok(findCrashKeywords("cyclist struck on Wonderland").includes("cyclist struck"));
      assert.ok(findCrashKeywords("bicyclist struck at Richmond").includes("cyclist struck"));
      assert.ok(findCrashKeywords("empty seat at Oxford and Highbury").includes("MVC"));
      assert.ok(findCrashKeywords("empty vee on Wellington").includes("MVA"));
      assert.ok(
        findCrashKeywords("MVC Oxford, vehicle blocking two lanes").includes("blocking lanes"),
      );
      assert.deepEqual(findCrashKeywords("blocking two lanes, standby"), []);
    },
  ],
  [
    "extended blacklist drops smoke investigation, lift, and medical calls",
    () => {
      assert.deepEqual(
        findCrashKeywords("Engine 3, smoke investigation, accident reported"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 5, odour of smoke, collision on Oxford"),
        [],
      );
      assert.deepEqual(findCrashKeywords("Engine 2, lift, MVC reported"), []);
      assert.deepEqual(findCrashKeywords("Engine 7, medical call, accident on Dundas"), []);
      assert.deepEqual(
        findCrashKeywords("Engine 4, automatic fire alarm, collision reported"),
        [],
      );
      assert.deepEqual(
        findCrashKeywords("Engine 5, person entrapment in the elevator, Main Street"),
        [],
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
