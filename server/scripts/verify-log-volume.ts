import assert from "node:assert/strict";
import { parseRawAlerts } from "../src/engine/wazeAggregator";

/**
 * A London poll carries hundreds of construction rows. Per-row drop logging
 * flooded Railway with thousands of lines a minute and buried real incidents,
 * so at the default log level a poll must emit a small, fixed number of lines
 * regardless of how much roadwork the city has posted.
 */
const MAX_LINES_PER_POLL = 5;

function buildRoadworkRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "HAZARD",
    subType: "HAZARD_ON_ROAD_CONSTRUCTION",
    street: `Test St ${i}`,
    reported_by: i % 3 === 0 ? "LDNONTTMC" : undefined,
    location: { x: -81.24 + i * 0.0001, y: 42.98 },
  }));
}

const captured: string[] = [];
const originalLog = console.log;
const originalError = console.error;
console.log = (...args: unknown[]) => void captured.push(args.join(" "));
console.error = (...args: unknown[]) => void captured.push(args.join(" "));

let retained = 0;
try {
  const rows = [
    ...buildRoadworkRows(300),
    {
      type: "ACCIDENT",
      subType: "ACCIDENT_MAJOR",
      street: "Oxford St E",
      location: { x: -81.22, y: 42.98 },
    } as Record<string, unknown>,
  ];
  retained = parseRawAlerts(rows, "openwebninja").length;
} finally {
  console.log = originalLog;
  console.error = originalError;
}

assert.equal(retained, 1, "the single real collision must survive 300 roadwork rows");
assert.ok(
  captured.length <= MAX_LINES_PER_POLL,
  `expected <= ${MAX_LINES_PER_POLL} log lines for a 301-row poll, got ${captured.length}:\n${captured.join("\n")}`,
);

// The summary is what keeps dropped volume visible now that per-row logs are gone.
const summary = captured.find((line) => line.includes("ingestion summary"));
assert.ok(summary, "a per-poll ingestion summary must still be emitted");
assert.ok(summary.includes('"dropped":300'), `summary must report the drop count: ${summary}`);

console.error(
  `PASS  301 raw rows (300 roadwork) produced ${captured.length} log line(s), 1 incident retained`,
);
console.error("\nAll log volume checks passed");
