import assert from "node:assert/strict";
import {
  isBreakdown,
  isMajorHazard,
  isMunicipalNotice,
  isNotifiableCrash,
  isTrueCrash,
  parseRawAlerts,
} from "../src/engine/wazeAggregator";

const checks: Array<[string, () => void]> = [
  [
    "POLICE is never masked by the anchored _ICE weather exclusion",
    () => {
      // The weather rule drops real ice hazards...
      assert.equal(isMajorHazard("HAZARD", "HAZARD_WEATHER_ICE"), false);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_ICE"), false);
      // ...but the substring "ice" inside POLICE must never trigger it, so a
      // stopped vehicle with police on scene is still retained.
      assert.equal(
        isMajorHazard("HAZARD", "HAZARD_ON_ROAD_CAR_STOPPED", "Police on scene"),
        true,
      );
      // And a collision mentioning police still ingests as a crash.
      const parsed = parseRawAlerts(
        [
          {
            type: "HAZARD",
            street: "Highbury Ave",
            description: "Police on scene of a collision",
            location: { x: -81.21, y: 42.99 },
          },
        ] as Record<string, unknown>[],
        "openwebninja",
      );
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0]?.type, "ACCIDENT");
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
    "only stopped/disabled vehicles and other-side crashes survive the hazard branch",
    () => {
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_CAR_STOPPED"), true);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_SHOULDER_CAR_STOPPED"), true);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_FEATURE"), true);
      // Everything else in the hazard branch is now dropped outright.
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_EMERGENCY_VEHICLE"), false);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD_OBJECT"), false);
      assert.equal(isMajorHazard("HAZARD", null), false);
      assert.equal(isMajorHazard("HAZARD", "HAZARD_ON_ROAD"), false);
    },
  ],
  [
    "reported municipal notices are recognized as road work",
    () => {
      assert.equal(isMunicipalNotice("Sections of roadway for surface treatment"), true);
      assert.equal(isMunicipalNotice("Road construction"), true);
      assert.equal(isMunicipalNotice("Road resurfacing on Parson Road"), true);
      assert.equal(isMunicipalNotice("Lane closure on Second Line"), true);
      assert.equal(isMunicipalNotice("Watermain maintenance"), true);
      // Real incidents must never read as municipal work.
      assert.equal(isMunicipalNotice("Two-vehicle collision"), false);
      assert.equal(isMunicipalNotice("Disabled vehicle blocking the right lane"), false);
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
    "ingestion keeps only collisions and stopped vehicles",
    () => {
      const rows = [
        { type: "ACCIDENT", subType: "ACCIDENT_MAJOR", street: "Oxford St E", location: { x: -81.22, y: 42.98 } },
        { type: "HAZARD", subType: "HAZARD_ON_ROAD_CAR_STOPPED", street: "Highbury Ave", location: { x: -81.21, y: 42.99 } },
        { type: "HAZARD", subType: "HAZARD_ON_ROAD_CONSTRUCTION", street: "Dundas St", location: { x: -81.24, y: 42.98 } },
        { type: "HAZARD", subType: "HAZARD_ON_ROAD_EMERGENCY_VEHICLE", street: "Adelaide St", location: { x: -81.23, y: 42.97 } },
        { type: "JAM", subType: "JAM_HEAVY_TRAFFIC", street: "Wonderland Rd", location: { x: -81.28, y: 42.94 } },
      ] as Record<string, unknown>[];

      const parsed = parseRawAlerts(rows, "blocksinside");
      const kept = parsed.map((alert) => `${alert.type}/${alert.subtype}`).sort();
      assert.deepEqual(kept, [
        "ACCIDENT/ACCIDENT_MAJOR",
        "HAZARD/HAZARD_ON_ROAD_CAR_STOPPED",
      ]);

      const stopped = parsed.find((alert) => alert.type === "HAZARD");
      assert.ok(stopped);
      assert.equal(isNotifiableCrash(stopped.type, stopped.subtype), true);
    },
  ],
  [
    "the roadwork the operator reported never reaches the feed",
    () => {
      const rows = [
        {
          type: "HAZARD",
          street: "Parson Road",
          description: "Sections of roadway for surface treatment",
          reported_by: "Transnomis Solutions",
          location: { x: -81.19, y: 42.95 },
        },
        {
          type: "HAZARD",
          street: "Second Line",
          description: "Road construction",
          location: { x: -81.31, y: 43.02 },
        },
        {
          type: "OTHER",
          street: "Parson Road",
          description: "Sections of roadway for surface treatment",
          location: { x: -81.19, y: 42.95 },
        },
        {
          type: "ROAD_CLOSED",
          street: "Linkway Blvd",
          description: "Road closed for resurfacing",
          location: { x: -81.33, y: 42.96 },
        },
      ] as Record<string, unknown>[];

      assert.deepEqual(parseRawAlerts(rows, "openwebninja"), []);
    },
  ],
  [
    "a real crash from a municipal publisher still gets through",
    () => {
      const rows = [
        {
          type: "HAZARD",
          street: "Wharncliffe Rd",
          description: "Collision blocking the curb lane",
          reported_by: "Transnomis Solutions",
          location: { x: -81.25, y: 42.97 },
        },
      ] as Record<string, unknown>[];

      const parsed = parseRawAlerts(rows, "openwebninja");
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0]?.type, "ACCIDENT");
    },
  ],
  [
    "OpenWebNinja/Cavsn crashes map alert_id and latitude/longitude",
    () => {
      const own = parseRawAlerts(
        [
          {
            alert_id: "own-1",
            type: "ACCIDENT",
            latitude: 42.9849,
            longitude: -81.2453,
            street: "Richmond St",
          },
        ] as Record<string, unknown>[],
        "openwebninja",
      );
      assert.equal(own.length, 1);
      assert.equal(own[0]?.alertId, "own-1");
      assert.equal(own[0]?.lat, 42.9849);
      assert.equal(own[0]?.lng, -81.2453);
      assert.equal(own[0]?.type, "ACCIDENT");

      const accidents = parseRawAlerts(
        [
          {
            uuid: "cavsn-1",
            type: "ACCIDENTS",
            location: { lat: 43.0092, lng: -81.2738 },
          },
        ] as Record<string, unknown>[],
        "cavsn",
      );
      assert.equal(accidents.length, 1);
      assert.equal(accidents[0]?.alertId, "cavsn-1");
      assert.equal(accidents[0]?.lat, 43.0092);
      assert.equal(accidents[0]?.lng, -81.2738);
      assert.equal(accidents[0]?.type, "ACCIDENT");

      const xy = parseRawAlerts(
        [
          {
            id: 99,
            type: "ACCIDENT",
            location: { x: -81.2453, y: 42.9849 },
          },
        ] as Record<string, unknown>[],
        "cavsn",
      );
      assert.equal(xy.length, 1);
      assert.equal(xy[0]?.alertId, "99");
      assert.equal(xy[0]?.lat, 42.9849);
      assert.equal(xy[0]?.lng, -81.2453);

      assert.deepEqual(
        parseRawAlerts(
          [
            {
              alert_id: "drop-hazard",
              type: "HAZARD",
              subType: "HAZARD_ON_ROAD",
              latitude: 42.98,
              longitude: -81.24,
            },
            {
              alert_id: "drop-police",
              type: "POLICE",
              latitude: 42.98,
              longitude: -81.24,
            },
            {
              alert_id: "drop-construction",
              type: "HAZARD",
              subType: "HAZARD_ON_ROAD_CONSTRUCTION",
              latitude: 42.98,
              longitude: -81.24,
            },
          ] as Record<string, unknown>[],
          "openwebninja",
        ),
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

console.error(failures === 0 ? "\nAll filter checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
