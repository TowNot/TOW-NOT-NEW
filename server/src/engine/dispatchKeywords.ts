/**
 * Crash / critical-hazard detection for London Fire dispatch transcripts.
 *
 * A buffer only posts when findCrashKeywords() returns a hit. MVC language
 * is the common case, but London Fire also dispatches Engine/Pumper units
 * to vehicle-into-infrastructure scenes that never say "MVC" — tractor
 * trailer, hit the pole, light pole, pole down, wires across the street.
 * Those must still post-and-notify.
 *
 * negativeKeywords is a hard blacklist: if any of these appear, the buffer
 * is dropped even when a crash term (extricated, accident, MVC, …) also
 * matched. London Fire uses the same extrication language for elevator
 * rescues and similar non-road calls.
 */

export type DispatchPriority = "critical" | "high" | "normal";

/** Blacklist: any hit drops the transcript before it can post to the desk. */
export const negativeKeywords = [
  "elevator",
  "escalator",
  "medical assist",
  "medical assistance",
  "alarm",
];

function keywordBoundaryRe(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}s?\\b`, "i");
}

export function findNegativeKeywords(transcript: string): string[] {
  const hits: string[] = [];
  for (const keyword of negativeKeywords) {
    if (keywordBoundaryRe(keyword).test(transcript) && !hits.includes(keyword)) {
      hits.push(keyword);
    }
  }
  return hits;
}

const CRASH_PATTERNS: { label: string; re: RegExp }[] = [
  // Acronyms incl. punctuated/spaced forms and STT misreads over static:
  // "MVC" / "M.V.C." / "MV C", "MVA", "NBC" (STT misread), "N V C".
  { label: "MVC", re: /\bM\.?\s?V\.?\s?C\.?\b/i },
  { label: "MVA", re: /\bM\.?\s?V\.?\s?A\.?\b/i },
  { label: "MVC", re: /\bNBC\b/i }, // static/STT misread of "MVC"
  { label: "MVC", re: /\bN\.?\s?V\.?\s?C\.?\b/i }, // static/STT misread of "MVC"
  { label: "collision", re: /\bcollisions?\b/i },
  { label: "vehicle collision", re: /\b(?:vehicle|motor\s+vehicle)\s+collisions?\b/i },
  { label: "motor vehicle", re: /\bmotor\s+vehicles?\b/i },
  { label: "accident", re: /\baccidents?\b/i },
  { label: "rollover", re: /\broll[- ]?overs?\b/i },
  { label: "t-bone", re: /\bt[- ]?bones?d?\b/i },
  { label: "rear end", re: /\brear[- ]?end(?:ed|s)?\b/i },
  { label: "extrication", re: /\bextricat(?:ion|e|ed|ing)\b/i },
  { label: "trapped", re: /\btrapped\b/i },
  { label: "patients", re: /\bpatients?\s+total\b/i },
  { label: "personal injury", re: /\bpersonal\s+injur(?:y|ies)\b/i },
  { label: "vehicle fire", re: /\b(?:vehicle|car|auto|truck|pickup|van|bus)\s+fires?\b/i },
  { label: "vehicle fire", re: /\b(?:vehicle|car|auto|truck|pickup|van|bus)s?\s+on\s+fire\b/i },
  {
    label: "multi-vehicle",
    re: /\b(?:\d+|one|two|three|four|five|single|multi(?:ple)?)[\s-]?(?:car|vehicle)s?\b/i,
  },
  // Pole / hydro / tractor-trailer scenes. London Fire often never says MVC
  // ("Engine 7, tractor trailer hit the pole, pole is down, wires across
  // the street") — those still have to post.
  {
    label: "hit pole",
    re: /\b(?:hit|hitting|struck|smashed(?:\s+into)?|ran\s+into)\s+(?:the\s+|a\s+)?(?:light\s+|hydro\s+|utility\s+|telephone\s+|power\s+|traffic\s+)?poles?\b/i,
  },
  { label: "light pole", re: /\b(?:light|hydro|utility|telephone|power)\s+poles?\b/i },
  { label: "pole down", re: /\bpole(?:s)?\s+(?:is\s+|are\s+|was\s+|were\s+)?down\b/i },
  {
    label: "wires down",
    re: /\b(?:wires?|lines?)\s+(?:are\s+|is\s+|were\s+)?(?:down|across)\b/i,
  },
  {
    label: "wires across the street",
    re: /\b(?:wires?|lines?)\s+across\s+(?:the\s+)?(?:street|road|roadway|lanes?)\b/i,
  },
  { label: "tractor trailer", re: /\btractor[\s-]?trailers?\b/i },
];

const CODE4_RE = /\bcode\s*(?:4|four)\b/i;
const CODE3_RE = /\bcode\s*(?:3|three)\b/i;

export function findCrashKeywords(transcript: string): string[] {
  if (findNegativeKeywords(transcript).length > 0) return [];
  const hits: string[] = [];
  for (const { label, re } of CRASH_PATTERNS) {
    if (re.test(transcript) && !hits.includes(label)) hits.push(label);
  }
  // Code 4 + a vehicle word: London Fire often dispatches "Engine 7, …
  // code 4" and only later says MVC. Treat that as a crash so the first
  // transmission still posts.
  if (
    CODE4_RE.test(transcript) &&
    /\b(?:cars?|trucks?|vehicles?|trailers?|semis?|transports?)\b/i.test(transcript) &&
    !hits.includes("code 4 vehicle")
  ) {
    hits.push("code 4 vehicle");
  }
  // The multi-vehicle count pattern alone ("two vehicles on scene") is too
  // weak to declare a crash — require at least one substantive crash term.
  if (hits.length === 1 && hits[0] === "multi-vehicle") return [];
  return hits;
}

/**
 * Priority rules: any MVC/crash/pole-hydro keyword hit → "critical"
 * (mandatory post-and-notify). Code 4 without that language → "high".
 * Code 3 routine calls → "normal".
 */
export function classifyPriority(transcript: string): DispatchPriority {
  if (findCrashKeywords(transcript).length > 0) return "critical";
  if (CODE4_RE.test(transcript)) return "high";
  if (CODE3_RE.test(transcript)) return "normal";
  return "normal";
}
