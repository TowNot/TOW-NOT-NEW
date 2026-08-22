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
  "lift assist",
  "wellness check",
  "carbon monoxide",
  "CO alarm",
  "automatic alarm",
  "automatic fire alarm",
  "smoke investigation",
  "odour of smoke",
  "odor of smoke",
  "lift",
  "medical call",
  "medical emergency",
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
  { label: "MVC", re: /\bempty\s+seat\b/i }, // STT misread of "MVC"
  { label: "MVA", re: /\bempty\s+vee\b/i }, // STT misread of "MVA"
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
  // Pedestrian, highway, and entrapment phrasing common on London traffic calls.
  { label: "pedestrian struck", re: /\b(?:ped(?:estrian)?|pedestrian)\s+struck\b/i },
  { label: "pedestrian struck", re: /\b(?:struck|hit)\s+(?:a\s+)?ped(?:estrian)?\b/i },
  { label: "pedestrian struck", re: /\bvs\.?\s+ped(?:estrian)?\b/i },
  { label: "ejected", re: /\bejected\b/i },
  { label: "overturned", re: /\boverturn(?:ed|s)?\b/i },
  { label: "jackknife", re: /\bjack[\s-]?knif(?:ed|e|ing)\b/i },
  { label: "in the ditch", re: /\b(?:in|into)\s+(?:the\s+)?ditch\b/i },
  { label: "guardrail", re: /\bguard[\s-]?rails?\b/i },
  {
    label: "struck building",
    re: /\b(?:hit|struck|ran\s+into|into)\s+(?:the\s+|a\s+)?building\b/i,
  },
  {
    label: "vehicle pinning",
    re: /\b(?:pinn?(?:ed|ing)|pinning)\s+(?:in\s+)?(?:the\s+)?(?:vehicle|car|truck|auto)\b/i,
  },
  {
    label: "vehicle pinning",
    re: /\b(?:vehicle|car|truck|auto)s?\s+(?:is\s+)?pinn?(?:ed|ing)\b/i,
  },
  { label: "entrapment", re: /\bentrapments?\b/i },
  { label: "VSBR", re: /\bVSBR\b/i },
  {
    label: "vehicle into structure",
    re: /\bvehicle\s+into\s+(?:a\s+)?structure\b/i,
  },
  { label: "fuel spill", re: /\bfuel\s+spills?\b/i },
  { label: "fluid spill", re: /\bfluid\s+spills?\b/i },
  { label: "cyclist struck", re: /\b(?:bicyclist|cyclist|bike)\s+struck\b/i },
  { label: "cyclist struck", re: /\b(?:struck|hit)\s+(?:a\s+)?(?:bicyclist|cyclist|bike)\b/i },
];

const CODE4_RE = /\bcode\s*(?:4|four)\b/i;
const CODE3_RE = /\bcode\s*(?:3|three)\b/i;
const BLOCKING_LANES_RE =
  /\b(?:blocking|blocked)\s+(?:the\s+)?(?:(?:\d+|one|two|three|four|five)\s+)?lanes?\b/i;
const VEHICLE_CONTEXT_RE =
  /\b(?:vehicle|car|truck|trailer|semi|MVC|MVA|accident|collision|motor\s+vehicle)s?\b/i;

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
  if (
    BLOCKING_LANES_RE.test(transcript) &&
    VEHICLE_CONTEXT_RE.test(transcript) &&
    !hits.includes("blocking lanes")
  ) {
    hits.push("blocking lanes");
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

/**
 * EMS / ambulance language on shared Fire+EMS streams (CYKF Waterloo Region).
 * Checked only for zones with hasEmsFeed — London Fire blacklists many of
 * these same phrases so they never post as fire_dispatch.
 */
const EMS_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "ambulance", re: /\bambulances?\b/i },
  { label: "EMS", re: /\bEMS\b/ },
  { label: "paramedic", re: /\bparamedics?\b/i },
  { label: "medic", re: /\bmedics?\b/i },
  { label: "medical emergency", re: /\bmedical\s+emergenc(?:y|ies)\b/i },
  { label: "medical call", re: /\bmedical\s+calls?\b/i },
  { label: "medical assist", re: /\bmedical\s+assist(?:ance)?\b/i },
  { label: "chest pain", re: /\bchest\s+pains?\b/i },
  { label: "cardiac", re: /\bcardiac\b/i },
  { label: "unconscious", re: /\bunconscious\b/i },
  { label: "overdose", re: /\boverdoses?\b/i },
  { label: "difficulty breathing", re: /\bdifficult(?:y|ies)\s+(?:breathing|breath)\b/i },
  { label: "stroke", re: /\bstroke\b/i },
  { label: "seizure", re: /\bseizures?\b/i },
  { label: "CPR", re: /\bCPR\b/ },
  { label: "vital signs absent", re: /\bvital\s+signs?\s+absent\b/i },
  { label: "VSA", re: /\bVSA\b/ },
];

export function findEmsKeywords(transcript: string): string[] {
  const hits: string[] = [];
  for (const { label, re } of EMS_PATTERNS) {
    if (re.test(transcript) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}
