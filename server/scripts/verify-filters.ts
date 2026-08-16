import assert from "node:assert/strict";
import {
  isBreakdown,
  isMajorHazard,
  isNotifiableCrash,
  isTrueCrash,
  parseRawAlerts,
} from "../src/engine/wazeAggregator";

const checks: Array<[string, () => void]> = [
  [
    "POLICE is never masked by the anchored _ICE weather exclusion",
    () => {
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_POLICE"), true);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_WEATHER_ICE"), false);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_ICE"), false);
    },
  ],
  [
    "collision rows are unaffected by hazard exclusions",
    () => {
      assert.equal(isMajorHazard("ACCIDENT", "ACCIDENT_MAJOR"), false);
      assert.equal(isTrueCrash("ACCIDENT", "ACCIDENT_MAJOR"), true);
      assert.equal(isNotifiableCrash("ACCIDENT", "ACCIDENT_MINOR"), true);
    },
  ],
  [
    "major hazards are retained but silent",
    () => {
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_EMERGENCY_VEHICLE"), true);
      assert.equal(isNotifiableCrash("HAZARD", "HAZARD_ON_ROAD_EMERGENCY_VEHICLE"), false);
    },
  ],
  [
    "minor municipal notices are dropped",
    () => {
      for (const subtype of [
        "HAZARD_ON_ROAD_CONSTRUCTION",
        "HAZARD_ON_ROAD_REPAIR",
        "HAZARD_ON_ROAD_UTILITY",
        "HAZARD_ON_ROAD_WATERMAIN",
        "HAZARD_ON_ROAD_POT_HOLE",
        "HAZARD_ON_ROAD_LANE_CLOSED",
        "HAZARD_WEATHER_FOG",
        "HAZARD_WEATHER_HEAVY_SNOW",
        "HAZARD_WEATHER_FREEZING_RAIN",
        "HAZARD_ON_ROAD_ANIMALS",
        "HAZARD_ON_SHOULDER_ANIMALS",
        "HAZARD_ON_ROAD_ROAD_KILL",
        "HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT",
        "HAZARD_ON_ROAD_MISSING_SIGN",
      ]) {
        assert.equal(isMajorHazard("HAZARD", subtype), false, subtype);
      }
    },
  ],
  [
    "breakdowns stay notifiable",
    () => {
      assert.equal(isBreakdown("HAZARD", "HAZARD_ON_SHOULDER_CAR_STOPPED"), true);
      assert.equal(isNotifiableCrash("HAZARD", "HAZARD_ON_SHOULDER_CAR_STOPPED"), true);
    },
  ],
  [
    "ingestion keeps crashes and major hazards, drops jams and roadwork",
    () => {
      const rows = [
        { type: "ACCIDENT", subType: "ACCIDENT_MAJOR", street: "Oxford St E", location: { x: -81.22, y: 42.98 } },
        { type: "HAZARD", subType: "HAZARD_ON_ROAD_EMERGENCY_VEHICLE", street: "Highbury Ave", location: { x: -81.21, y: 42.99 } },
        { type: "HAZARD", subType: "HAZARD_ON_ROAD_CONSTRUCTION", street: "Dundas St", location: { x: -81.24, y: 42.98 } },
        { type: "JAM", subType: "JAM_HEAVY_TRAFFIC", street: "Wonderland Rd", location: { x: -81.28, y: 42.94 } },
      ] as Record<string, unknown>[];

      const parsed = parseRawAlerts(rows, "blocksinside");
      const kept = parsed.map((alert) => `${alert.type}/${alert.subtype}`).sort();
      assert.deepEqual(kept, [
        "ACCIDENT/ACCIDENT_MAJOR",
        "HAZARD/HAZARD_ON_ROAD_EMERGENCY_VEHICLE",
      ]);

      const hazard = parsed.find((alert) => alert.type === "HAZARD");
      assert.ok(hazard);
      assert.equal(isNotifiableCrash(hazard.type, hazard.subtype), false);
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

console.error(failures === 0 ? "\nAll filter checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
