import assert from "node:assert/strict";
import { extractDispatchLocation } from "../src/engine/dispatchLocation";

const checks: Array<[string, () => void]> = [
  [
    "intersection from a typical dispatch call",
    () => {
      assert.equal(
        extractDispatchLocation("765 calling Engine 3, MVC Wharncliffe and Oxford, code 4"),
        "Wharncliffe and Oxford",
      );
    },
  ],
  [
    "responding-to phrasing still yields the cross streets",
    () => {
      assert.equal(
        extractDispatchLocation("Engine 3 responding to Wharncliffe and Oxford"),
        "Wharncliffe and Oxford",
      );
    },
  ],
  [
    "numbered address with direction",
    () => {
      assert.equal(
        extractDispatchLocation("MVC at 455 Wonderland Road South, two vehicles"),
        "455 Wonderland Road South",
      );
    },
  ],
  [
    "phonetic misread of Wharncliffe is corrected before matching",
    () => {
      assert.equal(
        extractDispatchLocation("single vehicle MVC, Warncliffe and Oxfort"),
        "Wharncliffe and Oxford",
      );
    },
  ],
  [
    "corner-of phrasing",
    () => {
      assert.equal(
        extractDispatchLocation("MVC at the corner of Adelaide and Dundas"),
        "Adelaide and Dundas",
      );
    },
  ],
  [
    "highway plus a known street",
    () => {
      assert.equal(
        extractDispatchLocation("Pumper 1, MVC Highway 401 and Highbury"),
        "Highway 401 and Highbury",
      );
    },
  ],
  [
    "unit IDs and talkgroups are never treated as locations",
    () => {
      assert.equal(extractDispatchLocation("Pumper 1, transfer to Tac 1"), null);
      assert.equal(extractDispatchLocation("765 calling Engine 3, Engine 3 responding"), null);
    },
  ],
  [
    "a lone ambiguous word like King is not a location",
    () => {
      assert.equal(extractDispatchLocation("Engine 3 on scene, two patients, king"), null);
    },
  ],
  [
    "King is kept when it is one side of an intersection",
    () => {
      assert.equal(
        extractDispatchLocation("MVC King Street and Dundas"),
        "King and Dundas",
      );
    },
  ],
  [
    "London Ontario boilerplate does not become Ontario Street",
    () => {
      assert.equal(
        extractDispatchLocation("London Fire, MVC Richmond Street and Oxford, London Ontario"),
        "Richmond and Oxford",
      );
    },
  ],
];

function main(): void {
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
    failures === 0 ? "\nAll dispatch location checks passed" : `\n${failures} check(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
