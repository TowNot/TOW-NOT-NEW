import { logger } from "./pinoCompat";

/**
 * Local (no-LLM) extractor for London Fire radio transcripts.
 *
 * Deepgram Nova-3 returns punctuation and numerals; this parser then:
 *  1. Applies the phonetic misread dictionary (scanner static).
 *  2. Strips unit IDs, talkgroups, and dispatch boilerplate.
 *  3. Fuzzy-corrects remaining tokens against known London streets.
 *  4. Pulls a numbered address, an A-and-B intersection, a highway, or a
 *     single distinctive street — in that order.
 */

const STREET_TYPE =
  "(?:Road|Rd\\.?|Street|St\\.?|Avenue|Ave\\.?|Drive|Dr\\.?|Boulevard|Blvd\\.?|Line|Highway|Hwy\\.?|Court|Crt\\.?|Crescent|Cres\\.?|Way|Place|Pl\\.?|Parkway|Pkwy\\.?|Lane|Ln\\.?|Circle|Cir\\.?|Trail|Concession|Conc\\.?)";

const DIRECTION = "(?:North|South|East|West|N\\.?|S\\.?|E\\.?|W\\.?)";

const CONNECTOR =
  "(?:and|&|at|near|@|/|crossing|cross(?:es)?)";

/**
 * Whisper/Deepgram routinely garbles London street names over scanner static.
 * Keys are matched as whole words, case-insensitively.
 */
export const PHONETIC_STREET_FIXES: [RegExp, string][] = [
  [/\bde\s?bron\b/gi, "Deveron"],
  [/\bdevron\b/gi, "Deveron"],
  [/\bdeviron\b/gi, "Deveron"],
  [/\bdev(?:e|a)ran\b/gi, "Deveron"],
  [/\bwharncliff?\b/gi, "Wharncliffe"],
  [/\bwarncliff?e?\b/gi, "Wharncliffe"],
  [/\bhighbry\b/gi, "Highbury"],
  [/\bhi-?berry\b/gi, "Highbury"],
  [/\badelade\b/gi, "Adelaide"],
  [/\bdundass?\b/gi, "Dundas"],
  [/\boxfort\b/gi, "Oxford"],
  [/\bwellingtin\b/gi, "Wellington"],
  [/\bfan?shaw\b/gi, "Fanshawe"],
  [/\bcommissioner'?s?\b/gi, "Commissioners"],
];

/** Common London, ON street names for matching and fuzzy (edit-distance) correction. */
export const LONDON_STREETS = [
  "Deveron",
  "Wharncliffe",
  "Highbury",
  "Adelaide",
  "Dundas",
  "Oxford",
  "Wellington",
  "Fanshawe Park",
  "Fanshawe",
  "Commissioners",
  "Richmond",
  "Wonderland",
  "Hamilton",
  "Huron",
  "Sarnia",
  "Western",
  "Windermere",
  "Springbank",
  "Southdale",
  "Exeter",
  "Colonel Talbot",
  "Clarke",
  "Veterans Memorial",
  "Trafalgar",
  "Gore",
  "Bradley",
  "Ernest",
  "Pond Mills",
  "Wilton Grove",
  "Sunningdale",
  "Gainsborough",
  "Hyde Park",
  "Byron Baseline",
  "Riverside",
  "Horton",
  "York",
  "King",
  "Queens",
  "Cheapside",
  "Egerton",
  "Quebec",
  "Florence",
  "Brydges",
  "Culver",
  "Kipps",
  "Barker",
  "Cherryhill",
  "Platt's Lane",
  "Sanatorium",
  "Boler",
  "Griffith",
  "Andover",
  "Topping",
  "Wistow",
  "Blackacres",
  "Fallons",
  "Old Victoria",
  "Wickerson",
  "Jalna",
  "Meadowlily",
  "Highview",
  "Homeview",
  "Berkshire",
  "Baseline",
  "Emery",
  "Stanley",
  "Wortley",
  "Ridout",
  "Talbot",
  "Waterloo",
  "Colborne",
  "Maitland",
  "William",
  "Ontario",
  "Rectory",
  "Ashland",
  "Elizabeth",
  "Central",
  "Princess",
  "Dufferin",
  "Hillcrest",
  "McCormick",
  "Vauxhall",
] as const;

/** Short/common words that are also London streets — require a partner or a type. */
const AMBIGUOUS_STREETS = new Set(
  [
    "King",
    "York",
    "Queens",
    "Central",
    "William",
    "Elizabeth",
    "Ontario",
    "Stanley",
    "Talbot",
    "Clarke",
    "Gore",
    "Barker",
    "Florence",
    "Quebec",
    "Princess",
    "Dufferin",
    "Waterloo",
    "Colborne",
    "Maitland",
    "Emery",
    "Baseline",
    "Horton",
    "Western",
  ].map((name) => name.toLowerCase()),
);

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function streetNamePattern(): string {
  const names = [...LONDON_STREETS]
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((name) => escapeRe(name));
  return `(?:${names.join("|")})`;
}

function canonicalStreet(heard: string): string {
  const lower = heard.toLowerCase();
  const match = LONDON_STREETS.find((street) => street.toLowerCase() === lower);
  return match ?? heard;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Apply the phonetic misread dictionary to a heard location string. */
export function applyPhoneticFixes(location: string): string {
  let fixed = location;
  for (const [re, replacement] of PHONETIC_STREET_FIXES) {
    fixed = fixed.replace(re, replacement);
  }
  return fixed;
}

/**
 * Fuzzy-correct each street-name word against the known London street list.
 * Only fires on close misses (edit distance ≤ 2, and ≤ 1/3 of the name) so
 * genuinely different streets are never rewritten.
 */
export function fuzzyCorrectStreets(location: string): string {
  return location.replace(/[A-Za-z][A-Za-z']{3,}/g, (word) => {
    const stemRe =
      /^(north|south|east|west|road|street|avenue|drive|boulevard|line|highway|court|crescent|way|place|and|the)$/i;
    if (stemRe.test(word)) return word;
    let best: { street: string; dist: number } | null = null;
    for (const street of LONDON_STREETS) {
      const dist = levenshtein(word.toLowerCase(), street.toLowerCase());
      if (dist === 0) return word;
      if (dist > 0 && (!best || dist < best.dist)) best = { street, dist };
    }
    if (best && best.dist <= 2 && best.dist <= Math.ceil(word.length / 3)) {
      logger.debug(
        { from: word, to: best.street },
        "[fire-dispatch] Fuzzy street correction",
      );
      return best.street;
    }
    return word;
  });
}

function stripDispatchNoise(text: string): string {
  return text
    .replace(/\bLondon(?:\s*,?\s*Ontario|\s*,?\s*ON)?\b/gi, " ")
    .replace(/\bOntario\s*,?\s*Canada\b/gi, " ")
    .replace(
      /\b(?:engine|pumper|rescue|ladder|truck|aerial|car|station|unit|platoon)\s*\d+\b/gi,
      " ",
    )
    .replace(/\b(?:765|dispatch|london fire(?:\s+department)?|station alerting)\b/gi, " ")
    .replace(/\b(?:code|priority)\s*(?:\d+|one|two|three|four)\b/gi, " ")
    .replace(/\b(?:tac(?:tical)?|channel|talk\s*group)\s*\d+\b/gi, " ")
    .replace(
      /\b(?:responding(?:\s+to)?|en\s+route(?:\s+to)?|on\s+scene|calling|transfer(?:ring)?\s+to)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function formatStreet(name: string, type?: string, direction?: string): string {
  const parts = [canonicalStreet(name)];
  if (type) parts.push(type.replace(/\.$/, ""));
  if (direction) parts.push(direction.replace(/\.$/, ""));
  return parts.join(" ");
}

interface StreetHit {
  name: string;
  formatted: string;
  ambiguous: boolean;
  hasType: boolean;
  index: number;
}

function findKnownStreets(text: string): StreetHit[] {
  const re = new RegExp(
    `\\b(${streetNamePattern()})(?:\\s+(${STREET_TYPE}))?(?:\\s+(${DIRECTION}))?\\b`,
    "gi",
  );
  const hits: StreetHit[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const name = canonicalStreet(match[1] ?? "");
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      name,
      formatted: formatStreet(name, match[2], match[3]),
      ambiguous: AMBIGUOUS_STREETS.has(key),
      hasType: Boolean(match[2]),
      index: match.index,
    });
  }
  return hits;
}

function numberedAddress(text: string): string | null {
  const re = new RegExp(
    `\\b(\\d{1,5})\\s+(${streetNamePattern()})(?:\\s+(${STREET_TYPE}))?(?:\\s+(${DIRECTION}))?\\b`,
    "i",
  );
  const match = re.exec(text);
  if (!match) return null;
  return `${match[1]} ${formatStreet(match[2] ?? "", match[3], match[4])}`;
}

function explicitIntersection(text: string): string | null {
  const corner = new RegExp(
    `\\b(?:(?:the\\s+)?corner\\s+of)\\s+(${streetNamePattern()})(?:\\s+${STREET_TYPE})?(?:\\s+${DIRECTION})?\\s+${CONNECTOR}\\s+(${streetNamePattern()})(?:\\s+${STREET_TYPE})?(?:\\s+${DIRECTION})?\\b`,
    "i",
  );
  const cornerMatch = corner.exec(text);
  if (cornerMatch) {
    return `${canonicalStreet(cornerMatch[1] ?? "")} and ${canonicalStreet(cornerMatch[2] ?? "")}`;
  }

  const re = new RegExp(
    `\\b(${streetNamePattern()})(?:\\s+${STREET_TYPE})?(?:\\s+${DIRECTION})?\\s+${CONNECTOR}\\s+(?:the\\s+)?(?:corner\\s+of\\s+)?(${streetNamePattern()})(?:\\s+${STREET_TYPE})?(?:\\s+${DIRECTION})?\\b`,
    "i",
  );
  const match = re.exec(text);
  if (!match) return null;
  return `${canonicalStreet(match[1] ?? "")} and ${canonicalStreet(match[2] ?? "")}`;
}

function highwayMention(text: string): string | null {
  const match = /\b(?:highway|hwy)\s*(\d{1,3})\b/i.exec(text);
  if (!match) return null;
  return `Highway ${match[1]}`;
}

function genericTypedStreet(text: string): string | null {
  const re = new RegExp(
    `\\b((?:[A-Z][a-z']+)(?:\\s+[A-Z][a-z']+){0,2})\\s+(${STREET_TYPE})(?:\\s+(${DIRECTION}))?\\b`,
  );
  const match = re.exec(text);
  if (!match) return null;
  const name = match[1] ?? "";
  if (
    /^(Engine|Pumper|Rescue|Ladder|Truck|Aerial|Station|Channel|Code|Motor|Vehicle)$/i.test(
      name,
    )
  ) {
    return null;
  }
  return formatStreet(name, match[2], match[3]);
}

/**
 * Pull the clearest London, ON street / intersection / highway out of a
 * dispatch transcript. Returns null when nothing location-like was heard.
 */
export function extractDispatchLocation(transcript: string): string | null {
  const prepared = fuzzyCorrectStreets(
    stripDispatchNoise(applyPhoneticFixes(transcript)),
  );
  if (prepared.length < 3) return null;

  const address = numberedAddress(prepared);
  if (address) return address;

  const cross = explicitIntersection(prepared);
  if (cross) return cross;

  const streets = findKnownStreets(prepared);
  if (streets.length >= 2) {
    const [first, second] = streets;
    return `${first!.formatted} and ${second!.formatted}`;
  }

  const highway = highwayMention(prepared);
  const distinctive = streets.filter((hit) => !hit.ambiguous || hit.hasType);
  if (highway && distinctive[0]) {
    return `${highway} and ${distinctive[0].formatted}`;
  }
  if (highway) return highway;
  if (distinctive[0]) return distinctive[0].formatted;

  return genericTypedStreet(prepared);
}
