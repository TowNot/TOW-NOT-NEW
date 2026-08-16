import { ProxyAgent, fetch as undiciFetch } from "undici";
import { boundingBox, distanceKm } from "./geo";
import { logger } from "./pinoCompat";

/** Every provider the aggregator can pull live accidents from. */
export type ProviderSource =
  | "waze_direct"
  | "openwebninja"
  | "blocksinside"
  | "cavsn"
  | "google_maps"
  | "apify_phantom"
  | "apify_sian"
  | "apify_burbn"
  | "apify_mai_amm";

/**
 * Priority order for cross-provider dedup: when two providers report the
 * same accident (within 100 m), the copy from the earlier provider in this
 * list wins. blocksinside is first because it's the only source that has
 * verifiably caught real accidents.
 */
const PROVIDER_PRIORITY: ProviderSource[] = [
  "waze_direct",
  "blocksinside",
  "openwebninja",
  "cavsn",
  "google_maps",
  "apify_phantom",
  "apify_sian",
  "apify_burbn",
  "apify_mai_amm",
];

// Intersection-level dedup: ~50 m. Distinct crashes on nearby streets or
// adjacent intersections (e.g. Waterloo vs Cheapside) stay separate events.
const DEDUP_RADIUS_KM = 0.05; // 50 meters
// google_maps sends no alert ids and its pins drift ~100m between polls, so
// its cross-provider matching uses a much wider radius.
export const GOOGLE_MAPS_DEDUP_RADIUS_KM = 0.35; // 350 meters

export interface WazeAlert {
  alertId: string;
  provider: ProviderSource;
  type: string; // ACCIDENT | HAZARD | POLICE | ...
  subtype: string | null;
  street: string | null;
  city: string | null;
  lat: number;
  lng: number;
  reliability: number | null;
  confidence: number | null;
  numThumbsUp: number | null;
  description: string | null;
  reportedAt: Date;
}

/**
 * Snap a coordinate for spatial dedup keys. Two grid sizes:
 *  - tight (~15-20m, 0.00015°) when the row carries an event timestamp —
 *    the timestamp anchors identity, so the tight grid separates distinct
 *    crashes near the same intersection;
 *  - coarse (3 decimal places, ~110m) when no timestamp exists — coordinates
 *    are then the ONLY identity (id-less providers like google_maps), and
 *    observed drift of ~100m between polls would otherwise mint a new key
 *    (duplicate row + duplicate notification) on every wobble.
 */
function snapGrid(coord: number, tight: boolean): string {
  if (!tight) return coord.toFixed(3);
  const step = 0.00015;
  return (Math.round(coord / step) * step).toFixed(5);
}

/**
 * Extract the event's publish timestamp (ms since epoch) from the raw
 * provider row, tolerating every field shape seen live: numeric pubMillis
 * (Waze georss), publish_datetime_utc / publishDatetimeUtc (ISO strings),
 * and published/publishedAt fallbacks. Returns null when the provider
 * sends no event timestamp.
 */
function extractEventMillis(raw: Record<string, unknown>): number | null {
  // Numeric epoch fields — blocksinside sends `timestamp` as epoch ms (with
  // an RFC string mirror in `timestampUTC`); other feeds may send epoch
  // seconds or numeric strings. Normalize via plausibility instead of
  // trusting units, and reject implausible values so a bad field can never
  // stamp a months-old municipal hazard as "fresh" (defeating the
  // stale-hazard notification guard) or a fresh one as 1970 (suppressing it).
  for (const key of ["pubMillis", "pub_millis", "timestamp", "timestampUTC"]) {
    const t = normalizeEpoch(raw[key]);
    if (t !== null) return t;
  }
  for (const key of [
    "publish_datetime_utc",
    "publishDatetimeUtc",
    "timestampUTC",
    "publishedAt",
    "published",
  ]) {
    const iso = asString(raw[key]);
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && plausibleEpochMillis(t)) return t;
  }
  return null;
}

/** Epoch ms bounds: 2000-01-01 .. now + 7 days (municipal feeds post-date planned closures slightly). */
function plausibleEpochMillis(t: number): boolean {
  return t >= 946684800000 && t <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

/**
 * Accept a numeric (or numeric-string) epoch in ms or seconds and return
 * plausible epoch ms, else null.
 */
function normalizeEpoch(v: unknown): number | null {
  let n: number | null = asNumber(v);
  if (n === null && typeof v === "string" && /^\d{9,14}$/.test(v.trim())) {
    n = Number(v.trim());
  }
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  if (plausibleEpochMillis(n)) return n;
  const asMs = n * 1000; // maybe epoch seconds
  if (plausibleEpochMillis(asMs)) return asMs;
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Strict crash-only category filter. Exactly three Waze crash report
 * categories are allowed through the pipeline:
 *  - Standard Crash: ACCIDENT / ACCIDENT_MINOR
 *  - Pileup:         ACCIDENT_MAJOR
 *    (any ACCIDENT type or ACCIDENT_* subtype qualifies, covering future
 *    crash subtypes across all 7 providers)
 *  - Other Side Crash: HAZARD / HAZARD_ON_ROAD_FEATURE
 * Everything else — POLICE, construction, weather, jams, general hazards,
 * road closures — is dropped at the raw fetch layer and never processed,
 * stored, or notified.
 */
/**
 * Ingestion type allowlist: every row with one of these primary types (or an
 * ACCIDENT_* variant like ACCIDENT_MAJOR) is retained regardless of subtype.
 */
export const INGEST_TYPE_ALLOWLIST = new Set([
  "ACCIDENT",
  "HAZARD",
  "ROAD_CLOSED",
  "JAM",
  "TRAFFIC_JAM",
  "MAJOR_TRAFFIC",
  "INCIDENT",
  "OTHER",
]);

/**
 * Hard blocklist — STRICT equality only. These exact roadwork subtypes are
 * dropped before anything else looks at the row.
 */
const HARD_BLOCK_SUBTYPES = new Set([
  "HAZARD_ON_ROAD_CONSTRUCTION",
  "HAZARD_ON_ROAD_REPAIR",
  "HAZARD_ON_ROAD_UTILITY",
  "HAZARD_ON_ROAD_WATERMAIN",
]);

/**
 * Municipal traffic-management publishers. Their feeds are almost entirely
 * planned roadwork ("Sections of roadway for surface treatment", lane
 * closures, resurfacing), so nothing they post is ingested unless it carries
 * explicit crash or stopped-vehicle language.
 */
const BLOCKED_PUBLISHERS = new Set(["LDNONTTMC", "TRANSNOMIS"]);

/**
 * Municipal-notice language. Any row whose text matches is planned road work
 * rather than an active incident, whatever type the provider gave it. Matched
 * against underscore-normalized text so "Sections of roadway for surface
 * treatment" and "Road construction" are both caught.
 */
const MUNICIPAL_NOTICE_PATTERNS: RegExp[] = [
  /(^|_)CONSTRUCTION(_|$)/,
  /(^|_)ROADWORK(_|$)/,
  /(^|_)ROAD_WORK(_|$)/,
  /(^|_)SURFACE_TREATMENT(_|$)/,
  /(^|_)SURFACE_TREATMENTS(_|$)/,
  /(^|_)RESURFACING(_|$)/,
  /(^|_)REPAVING(_|$)/,
  /(^|_)PAVING(_|$)/,
  /(^|_)MILLING(_|$)/,
  /(^|_)GRADING(_|$)/,
  /(^|_)SEALING(_|$)/,
  /(^|_)LINE_PAINTING(_|$)/,
  /(^|_)STREET_SWEEPING(_|$)/,
  /(^|_)SWEEPING(_|$)/,
  /(^|_)SNOW_REMOVAL(_|$)/,
  /(^|_)TREE_(TRIMMING|REMOVAL|WORK)(_|$)/,
  /(^|_)SIDEWALK(_|$)/,
  /(^|_)SEWER(_|$)/,
  /(^|_)WATERMAIN(_|$)/,
  /(^|_)HYDRO(_|$)/,
  /(^|_)UTILITY(_|$)/,
  /(^|_)MAINTENANCE(_|$)/,
  /(^|_)REPAIRS?(_|$)/,
  /(^|_)DETOUR(_|$)/,
  /(^|_)LANE_CLOSED(_|$)/,
  /(^|_)LANE_CLOSURE(_|$)/,
  /(^|_)ROAD_CLOSED(_|$)/,
  /(^|_)ROAD_CLOSURE(_|$)/,
  /(^|_)CLOSURE(_|$)/,
  /(^|_)SPECIAL_EVENT(_|$)/,
  /(^|_)PARADE(_|$)/,
  /(^|_)FILMING(_|$)/,
];

/**
 * Crash-language keywords crawled across description/title/street text.
 * A word-boundary hit retains + classifies the row as a crash alert
 * regardless of its primary type/subtype.
 */
const CRASH_TEXT_KEYWORDS = [
  "CRASH",
  "ACCIDENT",
  "COLLISION",
  "HIT",
  "ROLLOVER",
  "FLIPPED",
  "MVC",
  "T-BONE",
  "STRUCK",
  "DISPATCH",
  "WRECK",
  "SINGLE_VEHICLE",
  "SINGLE VEHICLE",
  "MULTI_VEHICLE",
  "MULTI VEHICLE",
];

const CRASH_KEYWORDS = [
  "ACCIDENT",
  "CRASH",
  "PILEUP",
  "PILE_UP",
  "PILE UP",
  "CHAIN", // ACCIDENT_CHAIN_REACTION and any chain-collision variant
  "HAZARD_ON_ROAD_FEATURE",
  "OTHER_SIDE",
  "OTHER SIDE",
  "COLLISION",
  "ROLLOVER",
  "SINGLE_VEHICLE",
  "MULTI_VEHICLE",
];

/**
 * Non-crash rejection: applied ONLY to the subtype, so standard ACCIDENT or
 * HAZARD_ON_ROAD_FEATURE items are never dropped at the door because of
 * words appearing elsewhere. Rejects explicit municipal roadwork subtypes.
 */
const NON_CRASH_SUBTYPE_BLOCKLIST = [
  "CONSTRUCTION",
  "ROAD_CLOSED",
  "UTILITY",
  "ROADWORK",
];

/**
 * Notification gate: TRUE only for actual crash events —
 * ACCIDENT / ACCIDENT_MINOR / ACCIDENT_MAJOR (any ACCIDENT/CRASH match) and
 * "Car on Other Side" crash hazards (HAZARD_ON_ROAD_FEATURE / OTHER_SIDE).
 * Non-crash rows (general hazards, closures, jams) are stored + displayed
 * but must NEVER trigger push or SMS notifications.
 */
/**
 * TRUE only for actual crash events (ACCIDENT / CRASH / pileup / other-side).
 * Used by the parser to decide which rows normalize to type ACCIDENT —
 * hazards must keep their HAZARD type so the feed labels them correctly
 * and the notification freshness guard can distinguish them.
 */
/**
 * Breakdown / disabled-vehicle detection: stalled cars needing a tow.
 * These pass the crash filter (stored + displayed + notified) and are
 * flagged priority=high so operators get paged for towable stalls.
 */
const BREAKDOWN_SUBTYPE_KEYWORDS = [
  "CAR_STOPPED", // HAZARD_ON_ROAD_CAR_STOPPED / HAZARD_ON_SHOULDER_CAR_STOPPED
  "DISABLED_VEHICLE",
  "VEHICLE_BREAKDOWN",
  "BREAKDOWN",
];

export function isBreakdown(type: string, subtype: string | null): boolean {
  const t = type.toUpperCase();
  const s = (subtype ?? "").toUpperCase();
  return BREAKDOWN_SUBTYPE_KEYWORDS.some((k) => t.includes(k) || s.includes(k));
}

/**
 * Normalize provider text into the underscore-delimited token form the
 * hazard patterns are written against ("Road closed" -> "ROAD_CLOSED"), so a
 * single pattern set covers both Waze subtypes and free-text descriptions.
 */
function normalizeToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * The ONLY hazard subtypes allowed into the feed: a vehicle stopped in a live
 * traffic lane or on the shoulder, and Waze's "car on the other side" crash
 * report. This is an allowlist, not a blocklist — a hazard the list does not
 * recognize is dropped, so new municipal subtypes can never leak in.
 *
 * Patterns are anchored on token boundaries ((^|_)…(_|$)) rather than bare
 * substrings, so an exclusion like the weather rule `_ICE` below can never
 * mask POLICE, and these hazard rules never touch collision rows.
 */
const MAJOR_HAZARD_ALLOWLIST: RegExp[] = [
  /(^|_)CAR_STOPPED(_|$)/,
  /(^|_)STOPPED_VEHICLE(_|$)/,
  /(^|_)VEHICLE_STOPPED(_|$)/,
  /(^|_)DISABLED_VEHICLE(_|$)/,
  /(^|_)VEHICLE_BREAKDOWN(_|$)/,
  /(^|_)BREAKDOWN(_|$)/,
  /(^|_)HAZARD_ON_ROAD_FEATURE(_|$)/, // Waze "car on other side" = a crash
];

/**
 * Weather, wildlife, signage, and surface-defect hazards. Kept separate from
 * the municipal-notice list purely for logging clarity; both drop the row.
 */
const MINOR_HAZARD_PATTERNS: RegExp[] = [
  /(^|_)WEATHER(_|$)/,
  /(^|_)ICE(_|$)/,
  /(^|_)SNOW(_|$)/,
  /(^|_)FOG(_|$)/,
  /(^|_)HAIL(_|$)/,
  /(^|_)FLOOD(_|$)/,
  /(^|_)POT_?HOLES?(_|$)/,
  /(^|_)ANIMALS?(_|$)/,
  /(^|_)ROAD_KILL(_|$)/,
  /(^|_)MISSING_SIGN(_|$)/,
  /(^|_)TRAFFIC_LIGHT_FAULT(_|$)/,
  /(^|_)BROKEN_TRAFFIC_LIGHT(_|$)/,
  /(^|_)OBJECT_ON_ROAD(_|$)/,
  /(^|_)EMERGENCY_VEHICLE(_|$)/,
];

/** True when the row reads as planned municipal road work rather than an incident. */
export function isMunicipalNotice(...values: Array<string | null | undefined>): boolean {
  const haystacks = values
    .filter((value): value is string => Boolean(value))
    .map(normalizeToken);
  return MUNICIPAL_NOTICE_PATTERNS.some((re) => haystacks.some((value) => re.test(value)));
}

/**
 * Hazard retention, deliberately ruthless: the feed carries collisions,
 * vehicles stopped in traffic, and live fire dispatches — nothing else. A
 * HAZARD row is kept only when its subtype is on the allowlist above and it
 * carries no municipal-notice or minor-hazard language.
 */
export function isMajorHazard(
  type: string,
  subtype: string | null,
  text?: string | null,
): boolean {
  const t = normalizeToken(type);
  const s = normalizeToken(subtype ?? "");
  if (!t.includes("HAZARD") && !s.includes("HAZARD")) return false;

  const haystacks = [t, s, text ? normalizeToken(text) : ""].filter(Boolean);
  if (MINOR_HAZARD_PATTERNS.some((re) => haystacks.some((value) => re.test(value)))) {
    return false;
  }
  if (isMunicipalNotice(type, subtype, text)) return false;

  // Allowlist is checked against type/subtype only: a description mentioning a
  // stopped car must not promote a roadwork row.
  return MAJOR_HAZARD_ALLOWLIST.some((re) => re.test(t) || re.test(s));
}

export function isTrueCrash(type: string, subtype: string | null): boolean {
  const t = type.toUpperCase();
  const s = (subtype ?? "").toUpperCase();
  if (NON_CRASH_SUBTYPE_BLOCKLIST.some((k) => s.includes(k))) return false;
  return CRASH_KEYWORDS.some((k) => t.includes(k) || s.includes(k));
}

export function isNotifiableCrash(
  type: string,
  subtype: string | null,
): boolean {
  const s = (subtype ?? "").toUpperCase();
  if (NON_CRASH_SUBTYPE_BLOCKLIST.some((k) => s.includes(k))) {
    return false;
  }
  if (isTrueCrash(type, subtype)) return true;
  // Breakdowns / disabled vehicles are notifiable regardless of primary
  // type — a stalled car needing a tow is core business for operators.
  return isBreakdown(type, subtype);
}

function getRapidApiKey(): string {
  const apiKey = process.env["RAPIDAPI_KEY"];
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not configured");
  return apiKey;
}

/**
 * Shared parser for all providers' raw alert objects. Coordinate fallbacks
 * cover every payload shape observed live: flat locationY/locationX
 * (blocksinside, verified), nested location.{y,x}, nested
 * location.{latitude,longitude}, and flat latitude/longitude (openwebninja).
 */
export function parseRawAlerts(
  rawAlerts: Record<string, unknown>[],
  provider: ProviderSource,
): WazeAlert[] {
  const alerts: WazeAlert[] = [];
  let earlyDropped = 0;
  // Distinct raw type/subtype combos dropped by the crash filter, with
  // counts — logged once per parse so unexpected provider formats are
  // traceable without per-row log spam.
  const droppedCombos = new Map<string, number>();
  for (const raw of rawAlerts) {
    const type = asString(raw["type"]);
    // Providers vary: subtype may arrive as subType/subtype, or under a
    // "category" style field on some RapidAPI feeds.
    const subtype =
      asString(raw["subType"]) ??
      asString(raw["subtype"]) ??
      asString(raw["category"]);
    const tUp = (type ?? "").toUpperCase();
    const sUp = (subtype ?? "").toUpperCase();
    const rawDescription =
      asString(raw["reportDescription"]) ?? asString(raw["description"]);

    // CRASH KEYWORD CRAWL — runs FIRST, before any blocklist. Scans
    // description/reportDescription/title/street/subtype text on EVERY row
    // (HAZARD, ROAD_CLOSED, TRAFFIC_JAM included). Any hit promotes the row
    // to ACCIDENT and bypasses the publisher/subtype blocklists entirely.
    // Word-boundary matching, not raw substring — bare substring "HIT"
    // would flag every alert on "White Oaks Rd".
    const crashText = [
      rawDescription,
      asString(raw["title"]),
      asString(raw["street"]),
      subtype,
    ]
      .filter((s): s is string => s !== null && s !== undefined)
      .join(" | ");
    const keywordHit = CRASH_TEXT_KEYWORDS.find((k) =>
      new RegExp(
        `(^|[^A-Z0-9])${k.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}([^A-Z0-9]|$)`,
        "i",
      ).test(crashText),
    );

    // HARD BLOCKLIST (strict match only, keyword hits exempt): drop ONLY
    // rows whose subtype exactly equals a known roadwork subtype, or whose
    // reported_by exactly matches a blocked municipal publisher. Nothing
    // else is ever dropped for being generic — bare/null subtypes always
    // pass.
    const publisherUp = (
      asString(raw["reported_by"]) ??
      asString(raw["reportedBy"]) ??
      ""
    ).toUpperCase();
    // Publisher match: exact name or leading token — live feeds report
    // "Transnomis Solutions", not the bare "Transnomis".
    const isBlockedPublisher = [...BLOCKED_PUBLISHERS].some(
      (p) => publisherUp === p || publisherUp.startsWith(`${p} `),
    );
    // Breakdown / disabled-vehicle rows are exempt from the subtype blocklist —
    // stalled cars needing a tow always pass the crash filter.
    const breakdownHit = isBreakdown(tUp, sUp);
    const streetLabel = asString(raw["street"]) ?? "-";
    if (!keywordHit && !breakdownHit && HARD_BLOCK_SUBTYPES.has(sUp)) {
      earlyDropped++;
      const key = `blocklist:${tUp || "<no-type>"}/${sUp || "<no-subtype>"}`;
      droppedCombos.set(key, (droppedCombos.get(key) ?? 0) + 1);
      logger.debug(
        { provider, street: streetLabel, subtype: sUp || tUp },
        "[Aggregator] dropped roadwork subtype",
      );
      continue;
    }

    // MUNICIPAL PUBLISHER HARD DROP: LDNONTTMC / Transnomis publish planned
    // road work, not incidents. Nothing they post survives without explicit
    // crash or stopped-vehicle language.
    if (!keywordHit && !breakdownHit && isBlockedPublisher) {
      earlyDropped++;
      const key = `municipal-publisher:${publisherUp}`;
      droppedCombos.set(key, (droppedCombos.get(key) ?? 0) + 1);
      logger.debug(
        { provider, street: streetLabel, publisher: publisherUp },
        "[Aggregator] dropped municipal publisher row",
      );
      continue;
    }

    // MUNICIPAL NOTICE TEXT DROP: catches roadwork posted by unbranded
    // publishers or with a bare subtype — "Sections of roadway for surface
    // treatment", "Road construction", resurfacing, lane closures.
    if (
      !keywordHit &&
      !breakdownHit &&
      isMunicipalNotice(type, subtype, rawDescription, asString(raw["title"]))
    ) {
      earlyDropped++;
      const key = `municipal-notice:${tUp || "<no-type>"}/${sUp || "<no-subtype>"}`;
      droppedCombos.set(key, (droppedCombos.get(key) ?? 0) + 1);
      logger.debug(
        { provider, street: streetLabel, text: (rawDescription ?? sUp ?? tUp ?? "").slice(0, 80) },
        "[Aggregator] dropped municipal notice",
      );
      continue;
    }

    // ROAD_CLOSED HARD DROP: long-term closures, construction blockades, and
    // municipal street work all arrive as ROAD_CLOSED with no crash language
    // (e.g. the weeks-old Linkway Blvd closure). Drop every ROAD_CLOSED row
    // unless its subtype explicitly carries crash/accident language or the
    // keyword crawl above already promoted it to a crash.
    const closureHasCrashSubtype = CRASH_KEYWORDS.some((k) => sUp.includes(k));
    if (!keywordHit && !breakdownHit && tUp === "ROAD_CLOSED" && !closureHasCrashSubtype) {
      earlyDropped++;
      const key = `road-closed:${tUp}/${sUp || "<no-subtype>"}`;
      droppedCombos.set(key, (droppedCombos.get(key) ?? 0) + 1);
      logger.debug(
        { provider, street: streetLabel, subtype: sUp },
        "[Aggregator] dropped road closure",
      );
      continue;
    }

    // INGESTION GATE: a row survives when
    //  (a) its type/subtype carries explicit crash language (ACCIDENT*,
    //      CRASH, COLLISION, ROLLOVER, SINGLE_VEHICLE, MULTI_VEHICLE,
    //      pileup/chain/other-side variants), or
    //  (b) the keyword crawl found crash language in its description/title/
    //      street text (this is how google_maps OTHER /
    //      GOOGLE_MAPS_GENERIC_INCIDENT rows earn their way in — inspected,
    //      not auto-dropped; they only fall through when their raw payload
    //      carries no text at all), or
    //  (c) it is a breakdown / disabled vehicle (towable stall, kept per
    //      operator requirements at priority=high), or
    //  (d) it is a major hazard (emergency vehicle on scene, shoulder or
    //      single-vehicle events) — stored and mapped, never notified.
    // Everything else — minor municipal notices, jams, weather, congestion
    // pins — is rejected here.
    const crashTyped = tUp.startsWith("ACCIDENT") || isTrueCrash(tUp, sUp);
    const majorHazardHit = isMajorHazard(tUp, sUp, crashText);
    if (!keywordHit && !breakdownHit && !crashTyped && !majorHazardHit) {
      earlyDropped++;
      const key = `non-crash:${tUp || "<no-type>"}/${sUp || "<no-subtype>"}`;
      droppedCombos.set(key, (droppedCombos.get(key) ?? 0) + 1);
      logger.debug(
        { provider, street: streetLabel, reason: sUp || tUp || "no crash language" },
        "[Aggregator] dropped non-crash row",
      );
      continue;
    }

    // Full payload tracing stays at debug: a busy London poll carries hundreds
    // of rows, and dumping each one buries the incidents that matter.
    logger.debug({ provider, raw }, "[Aggregator] raw event retained");

    const acceptedAs = keywordHit || crashTyped
      ? "crash"
      : breakdownHit
        ? "breakdown"
        : "major hazard (silent)";
    logger.info(
      {
        provider,
        street: streetLabel,
        type: tUp || null,
        subtype: sUp || null,
        matchedKeyword: keywordHit ?? null,
      },
      `[Aggregator] ACCEPTED ${acceptedAs}`,
    );
    const location = (raw["location"] ?? {}) as Record<string, unknown>;
    const latVal =
      asNumber(raw["locationY"]) ??
      asNumber(location["y"]) ??
      asNumber(location["latitude"]) ??
      asNumber(location["lat"]) ??
      asNumber(raw["latitude"]) ??
      asNumber(raw["lat"]);
    const lngVal =
      asNumber(raw["locationX"]) ??
      asNumber(location["x"]) ??
      asNumber(location["longitude"]) ??
      asNumber(location["lng"]) ??
      asNumber(raw["longitude"]) ??
      asNumber(raw["lng"]);
    if (latVal === null || lngVal === null) {
      const key = "missing-coords";
      droppedCombos.set(key, (droppedCombos.get(key) ?? 0) + 1);
      logger.warn(
        { provider, street: streetLabel, type: raw["type"] },
        "[Aggregator] dropped row without coordinates",
      );
      continue;
    }

    alerts.push({
      alertId:
        asString(raw["uuid"]) ??
        asString(raw["alert_id"]) ??
        asString(raw["id"]) ??
        (typeof raw["id"] === "number" ? String(raw["id"]) : null) ??
        // Spatial-temporal fallback key when the provider sends no unique id.
        // With an event timestamp: ~15-20m grid + type + timestamp, so
        // repeated polls of one event collapse (coords + pubMillis stable)
        // while distinct crashes near the same intersection with different
        // coordinates or report times stay separate. Without a timestamp:
        // coarser ~50m grid so GPS jitter between polls doesn't mint
        // duplicate rows/notifications for the same ongoing event.
        (() => {
          const t = extractEventMillis(raw);
          const tight = t !== null;
          return `geo-${snapGrid(latVal, tight)},${snapGrid(lngVal, tight)}-${(type ?? "INCIDENT").toUpperCase()}${tight ? `-t${t}` : ""}`;
        })(),
      provider,
      // Keyword-crawl hits, ACCIDENT variants (ACCIDENT_MINOR/_MAJOR/
      // _PILE_UP/_CHAIN_REACTION/_OTHER_SIDE), and any type/subtype the
      // notification gate recognizes as a crash (pileup/chain/other-side
      // subtypes on non-ACCIDENT rows) normalize to ACCIDENT so they map
      // cleanly in the API payload and dispatch push/SMS. Other allowlisted
      // types (HAZARD/ROAD_CLOSED/JAM/OTHER) keep their raw type so the
      // gate can still distinguish crashes from stored-but-silent events.
      type:
        keywordHit || tUp.startsWith("ACCIDENT") || isTrueCrash(tUp, sUp)
          ? "ACCIDENT"
          : tUp || "OTHER",
      // Preserve the raw crash granularity: keep the provider subtype, or
      // fall back to the raw type when it carried the detail (e.g.
      // ACCIDENT_MAJOR as a type, HAZARD_ON_ROAD_FEATURE opposite-side).
      subtype: subtype ?? (type ? type.toUpperCase() : null),
      street: asString(raw["street"]),
      city: asString(raw["city"]),
      lat: latVal,
      lng: lngVal,
      reliability:
        asNumber(raw["reliability"]) ?? asNumber(raw["alert_reliability"]),
      confidence:
        asNumber(raw["confidence"]) ?? asNumber(raw["alert_confidence"]),
      numThumbsUp:
        asNumber(raw["nThumbsUp"]) ?? asNumber(raw["num_thumbs_up"]),
      description: rawDescription,
      // Waze event timestamp (pubMillis / publish datetime) when available,
      // so historical crash posts keep their true report time; fall back to
      // fetch time only when the provider sends no event timestamp.
      reportedAt: (() => {
        const t = extractEventMillis(raw);
        return t !== null ? new Date(t) : new Date();
      })(),
    });
  }
  // One line per provider per poll. The per-row detail above is debug-only, so
  // this summary is where dropped volume stays visible without flooding logs.
  logger.info(
    {
      provider,
      received: rawAlerts.length,
      retained: alerts.length,
      dropped: earlyDropped,
      droppedBy: Object.fromEntries(
        [...droppedCombos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      ),
    },
    "[Aggregator] ingestion summary",
  );
  return alerts;
}

/** Last observed HTTP status / latency / success time per provider feed. */
export interface ProviderFetchStat {
  lastFetchAt: string | null;
  lastStatus: number | null;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const fetchStats = new Map<ProviderSource, ProviderFetchStat>();
// Monotonic attempt counter per provider so an older, slower request that
// finishes late can't overwrite the metrics of a newer attempt.
const fetchAttemptSeq = new Map<ProviderSource, number>();

function statFor(provider: ProviderSource): ProviderFetchStat {
  let s = fetchStats.get(provider);
  if (!s) {
    s = {
      lastFetchAt: null,
      lastStatus: null,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastError: null,
    };
    fetchStats.set(provider, s);
  }
  return s;
}

/**
 * fetch() wrapper that records per-provider health metrics (timestamp,
 * HTTP status, wall-clock latency, last error) for /admin/provider-stats.
 * Network-level failures (timeout, DNS) are recorded with status null.
 */
async function timedProviderFetch(
  provider: ProviderSource,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const s = statFor(provider);
  const seq = (fetchAttemptSeq.get(provider) ?? 0) + 1;
  fetchAttemptSeq.set(provider, seq);
  const started = Date.now();
  s.lastFetchAt = new Date(started).toISOString();
  // Only the most recently STARTED attempt may record completion metrics,
  // so overlapping requests can't interleave status/latency from different
  // attempts.
  const isLatest = () => fetchAttemptSeq.get(provider) === seq;
  try {
    // When a dispatcher (proxy) is supplied, route through the installed
    // undici's fetch — Node's global fetch rejects dispatchers from a
    // different undici instance with an opaque "fetch failed".
    const res =
      "dispatcher" in init
        ? ((await undiciFetch(
            url,
            init as unknown as Parameters<typeof undiciFetch>[1],
          )) as unknown as Response)
        : await fetch(url, init);
    if (isLatest()) {
      s.lastLatencyMs = Date.now() - started;
      s.lastStatus = res.status;
      if (res.ok) {
        s.lastSuccessAt = new Date().toISOString();
        s.lastError = null;
      } else {
        s.lastError = `HTTP ${res.status}`;
      }
    } else if (res.ok) {
      s.lastSuccessAt = new Date().toISOString();
    }
    return res;
  } catch (err) {
    if (isLatest()) {
      s.lastLatencyMs = Date.now() - started;
      s.lastStatus = null;
      s.lastError = err instanceof Error ? err.message : String(err);
    }
    throw err;
  }
}

/** Runtime feed health snapshot for all providers (for the admin endpoint). */
export function getProviderRuntimeStats(): Record<
  ProviderSource,
  ProviderFetchStat & { coolingDownUntil: string | null }
> {
  const now = Date.now();
  const out = {} as Record<
    ProviderSource,
    ProviderFetchStat & { coolingDownUntil: string | null }
  >;
  for (const p of PROVIDER_PRIORITY) {
    const until = cooldownUntil.get(p) ?? 0;
    out[p] = {
      ...statFor(p),
      coolingDownUntil: until > now ? new Date(until).toISOString() : null,
    };
  }
  return out;
}

/** Per-provider fetch timeout — generous so slow API calls aren't aborted early. */
const PROVIDER_TIMEOUT_MS = 25_000;

/** Launch offset between providers so they never fire on the same millisecond. */
const PROVIDER_STAGGER_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/** Shared RapidAPI GET + tolerant body parsing ({data:{alerts}}, {alerts}, or bare array). */
async function fetchRapidApiAlerts(
  host: string,
  path: string,
  params: URLSearchParams,
  provider: ProviderSource,
): Promise<WazeAlert[]> {
  const url = `https://${host}${path}?${params.toString()}`;
  const started = Date.now();
  // 25s provider timeout: generous enough that slow-but-healthy RapidAPI
  // responses aren't aborted early (providers run concurrently, so a slow
  // one doesn't stall the others anyway).
  const res = await timedProviderFetch(provider, url, {
    headers: { "x-rapidapi-host": host, "x-rapidapi-key": getRapidApiKey() },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(
      { provider, status: res.status, latencyMs: Date.now() - started, body: body.slice(0, 300) },
      "Provider request failed",
    );
    throw new Error(`${provider} responded with status ${res.status}`);
  }
  logger.debug({ provider, status: res.status, latencyMs: Date.now() - started }, "Provider responded");
  const rawBody = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch (err) {
    logger.error({ provider, sample: rawBody.slice(0, 300) }, "Provider returned malformed JSON");
    throw err;
  }
  const json = (parsed ?? {}) as Record<string, unknown>;
  const data = (json["data"] ?? json) as Record<string, unknown>;
  const rawAlerts = Array.isArray(parsed)
    ? (parsed as Record<string, unknown>[])
    : Array.isArray(data["alerts"])
      ? (data["alerts"] as Record<string, unknown>[])
      : [];
  logger.debug({ provider, items: rawAlerts.length, bytes: rawBody.length }, "Provider payload");
  return parseRawAlerts(rawAlerts, provider);
}

/**
 * Direct Waze LiveMap GeoRSS endpoint — no RapidAPI middleman. Requires a
 * browser-like User-Agent and a live-map Referer or Waze rejects the call.
 * Payload shape: { alerts: [{ type, subtype, location: {x, y}, ... }] } —
 * parseRawAlerts already handles nested location.{x,y} coordinates and
 * applies no reliability/confidence/thumbs-up filtering.
 */
async function fetchWazeDirect(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const box = boundingBox(lat, lng, radiusKm);
  const params = new URLSearchParams({
    top: `${box.topRight.lat}`,
    bottom: `${box.bottomLeft.lat}`,
    left: `${box.bottomLeft.lng}`,
    right: `${box.topRight.lng}`,
    env: "na",
    types: "alerts",
  });
  const url = `https://www.waze.com/live-map/api/georss?${params.toString()}`;
  const started = Date.now();
  // Residential proxy: route through RESIDENTIAL_PROXY_URL when set, so the
  // request originates from a residential IP instead of the datacenter range
  // Waze blocks. undici's ProxyAgent is the fetch-native equivalent of
  // https-proxy-agent (Node's global fetch ignores http.Agent instances).
  const proxyUrl = process.env.RESIDENTIAL_PROXY_URL;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  const res = await timedProviderFetch("waze_direct", url, {
    // Cast: the installed undici's Dispatcher type differs nominally from the
    // undici-types version bundled with Node, but they're runtime-compatible.
    ...(dispatcher ? ({ dispatcher } as unknown as RequestInit) : {}),
    headers: {
      Referer: "https://www.waze.com/live-map",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(
      { provider: "waze_direct", status: res.status, latencyMs: Date.now() - started, body: body.slice(0, 300) },
      "Provider request failed",
    );
    throw new Error(`waze_direct responded with status ${res.status}`);
  }
  logger.debug({ provider: "waze_direct", status: res.status, latencyMs: Date.now() - started }, "Provider responded");
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const rawAlerts = Array.isArray(json["alerts"])
    ? (json["alerts"] as Record<string, unknown>[])
    : [];
  const alerts = parseRawAlerts(rawAlerts, "waze_direct");
  logger.debug(
    { proxied: Boolean(proxyUrl), received: rawAlerts.length, retained: alerts.length },
    "Direct Waze ingestion complete",
  );
  return alerts;
}

/** OpenWeb Ninja — waze.p.rapidapi.com /alerts-and-jams, snake_case box params. */
async function fetchOpenWebNinja(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const box = boundingBox(lat, lng, radiusKm);
  return fetchRapidApiAlerts(
    "waze.p.rapidapi.com",
    "/alerts-and-jams",
    new URLSearchParams({
      bottom_left: `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
      top_right: `${box.topRight.lat},${box.topRight.lng}`,
      // No alert_types filter: the widened ingestion allowlist accepts
      // accidents, hazards, closures, jams, and other — filter client-side.
      max_alerts: "300",
      max_jams: "0",
    }),
    "openwebninja",
  );
}

/** BlocksInside — waze-api.p.rapidapi.com /alerts, kebab-case box params. */
async function fetchBlocksInside(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const box = boundingBox(lat, lng, radiusKm);
  return fetchRapidApiAlerts(
    "waze-api.p.rapidapi.com",
    "/alerts",
    new URLSearchParams({
      "bottom-left": `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
      "top-right": `${box.topRight.lat},${box.topRight.lng}`,
      // Widened API filter: request every alert class the ingestion
      // allowlist accepts; the parser's hard blocklist drops the roadwork.
      filter: '["ACCIDENTS","HAZARDS","ROAD_CLOSED","JAMS","OTHER"]',
      limit: "300",
    }),
    "blocksinside",
  );
}

/** Cavsn — waze-api-waze-scraper.p.rapidapi.com /waze/alerts-and-jams. */
async function fetchCavsn(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const box = boundingBox(lat, lng, radiusKm);
  return fetchRapidApiAlerts(
    "waze-api-waze-scraper.p.rapidapi.com",
    "/waze/alerts-and-jams",
    new URLSearchParams({
      bottom_left: `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
      top_right: `${box.topRight.lat},${box.topRight.lng}`,
      // No alert_types filter: widened ingestion accepts all alert classes
      // (this feed has returned zero items historically anyway).
      max_alerts: "300",
      max_jams: "0",
    }),
    "cavsn",
  );
}

/**
 * Google Maps Traffic Alerts (letscrape, RapidAPI PRO). Payload:
 * { status, data: { count, alerts: [{ type, latitude, longitude }] } } —
 * types observed live: "incident", "road_closed", "construction". No ids,
 * streets, or descriptions, so parseRawAlerts mints spatial fallback keys
 * and the crash keyword crawl has no text to scan; classification rides
 * entirely on the mapped type. Zoom note: zoom=14 caps the queryable area
 * at 125 km² — far below our 15km-radius box (~900 km²) — and zoom=12
 * responds in 4.5-5.3s, blowing the 4s budget. zoom=11 covers the full box
 * within ~3s, so that's what we send.
 */
const GOOGLE_MAPS_TYPE_MAP: Record<string, { type: string; subType?: string }> =
  {
    // STRICT crash classification: only pins Google explicitly flags as a
    // crash/collision become ACCIDENT. Generic "incident" pins turned out to
    // be traffic delays/congestion/roadwork (false-positive construction
    // alerts, e.g. Highbury Ave @ 401), so they are stored silently as OTHER
    // — visible on the map, never promoted, never notified.
    accident: { type: "ACCIDENT" },
    crash: { type: "ACCIDENT" },
    collision: { type: "ACCIDENT" },
    incident: { type: "OTHER", subType: "GOOGLE_MAPS_GENERIC_INCIDENT" },
    congestion: { type: "OTHER", subType: "GOOGLE_MAPS_GENERIC_INCIDENT" },
    delay: { type: "OTHER", subType: "GOOGLE_MAPS_GENERIC_INCIDENT" },
    // Construction / closures / maintenance all normalize to the exact
    // hard-blocked roadwork subtype so the standard ingestion blocklist
    // drops them automatically.
    construction: {
      type: "HAZARD",
      subType: "HAZARD_ON_ROAD_CONSTRUCTION",
    },
    road_closed: {
      type: "HAZARD",
      subType: "HAZARD_ON_ROAD_CONSTRUCTION",
    },
    roadwork: {
      type: "HAZARD",
      subType: "HAZARD_ON_ROAD_CONSTRUCTION",
    },
    maintenance: {
      type: "HAZARD",
      subType: "HAZARD_ON_ROAD_CONSTRUCTION",
    },
  };

async function fetchGoogleMaps(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const box = boundingBox(lat, lng, radiusKm);
  const host = "google-maps-traffic-alerts.p.rapidapi.com";
  const params = new URLSearchParams({
    bottom_left: `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
    top_right: `${box.topRight.lat},${box.topRight.lng}`,
    zoom: "11",
  });
  const url = `https://${host}/traffic-alerts?${params.toString()}`;
  const started = Date.now();
  // 25s provider timeout, matching the other RapidAPI fetchers.
  const res = await timedProviderFetch("google_maps", url, {
    headers: { "x-rapidapi-host": host, "x-rapidapi-key": getRapidApiKey() },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(
      { provider: "google_maps", status: res.status, latencyMs: Date.now() - started, body: body.slice(0, 300) },
      "Provider request failed",
    );
    throw new Error(`google_maps responded with status ${res.status}`);
  }
  logger.debug({ provider: "google_maps", status: res.status, latencyMs: Date.now() - started }, "Provider responded");
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const data = (json["data"] ?? {}) as Record<string, unknown>;
  const rawAlerts = Array.isArray(data["alerts"])
    ? (data["alerts"] as Record<string, unknown>[])
    : [];
  logger.debug({ provider: "google_maps", items: rawAlerts.length }, "Provider payload");
  // Normalize the provider's lowercase types into our Waze-style taxonomy
  // before the shared parser so the standard allowlist/blocklist/keyword
  // pipeline and 50m dedup apply unchanged.
  const normalized = rawAlerts.map((raw) => {
    const mapped =
      GOOGLE_MAPS_TYPE_MAP[(asString(raw["type"]) ?? "").toLowerCase()];
    return {
      ...raw,
      type: mapped?.type ?? (asString(raw["type"]) ?? "OTHER").toUpperCase(),
      ...(mapped?.subType ? { subType: mapped.subType } : {}),
    };
  });
  return parseRawAlerts(normalized, "google_maps");
}

/**
 * Apify Actor phantom_coder/waze-traffic-scraper (run-sync, build=beta —
 * `latest` fails without residential proxies). Dataset items are wrapper
 * objects { location, alerts: [...] }; flat alert items accepted defensively.
 * Token goes in the Authorization header, never the query string.
 */
async function fetchApifyPhantom(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const token = getApifyToken();

  const url =
    "https://api.apify.com/v2/acts/phantom_coder~waze-traffic-scraper/run-sync-get-dataset-items" +
    "?timeout=180&build=beta";
  const res = await timedProviderFetch("apify_phantom", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      latitude: lat,
      longitude: lng,
      radiusKm: Math.min(Math.max(radiusKm, 1), 100),
      includeAlerts: true,
      includeTrafficJams: false,
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    }),
    signal: AbortSignal.timeout(200_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(
      { provider: "apify_phantom", status: res.status, body: body.slice(0, 300) },
      "Provider request failed",
    );
    throw new Error(`apify_phantom responded with status ${res.status}`);
  }

  logger.debug({ provider: "apify_phantom", status: res.status }, "Provider responded");
  const parsed = (await res.json()) as unknown;
  const rawItems = flattenApifyItems(parsed, "apify_phantom");
  const alerts = parseRawAlerts(rawItems, "apify_phantom");
  logger.debug(
    { provider: "apify_phantom", received: rawItems.length, retained: alerts.length },
    "Apify actor complete",
  );
  return alerts;
}

function getApifyToken(): string {
  const token = process.env["APIFY_API_TOKEN"];
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");
  return token;
}

/**
 * Flatten Apify dataset items into raw alert rows. Handles both shapes seen
 * live: wrapper objects { location, alerts: [...] } (phantom_coder) and flat
 * per-alert rows with a `type` field (sian, burbn, mai_amm). Rows tagged as
 * jams (recordType/itemType/kind === "jam") are dropped.
 */
function flattenApifyItems(
  parsed: unknown,
  provider: ProviderSource,
): Record<string, unknown>[] {
  const items = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  const rawAlerts: Record<string, unknown>[] = [];
  for (const item of items) {
    const tag =
      asString(item["recordType"]) ??
      asString(item["itemType"]) ??
      asString(item["kind"]);
    if (tag && tag.toLowerCase().includes("jam")) continue;
    if (Array.isArray(item["alerts"])) {
      rawAlerts.push(...(item["alerts"] as Record<string, unknown>[]));
      const sources = item["dataSources"] as Record<string, unknown> | undefined;
      if (sources && typeof sources["alerts"] === "string" && sources["alerts"] !== "ok") {
        logger.debug({ provider, status: sources["alerts"] }, "Apify alerts dataSource status");
      }
    } else if (typeof item["type"] === "string") {
      rawAlerts.push(item);
    }
  }
  return rawAlerts;
}

/** Shared POST helper for run-sync Apify actors. */
async function runApifyActor(
  provider: ProviderSource,
  actorPath: string,
  query: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const res = await timedProviderFetch(
    provider,
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?${query}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApifyToken()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error(
      { provider, status: res.status, body: text.slice(0, 300) },
      "Provider request failed",
    );
    throw new Error(`${provider} responded with status ${res.status}`);
  }
  logger.debug({ provider, status: res.status }, "Provider responded");
  return (await res.json()) as unknown;
}

/**
 * Apify Actor burbn/waze-traffic-scraper (run-sync, latest build). Input is a
 * string bounding box (bottom_left/top_right "lat,lng"); jams disabled via
 * max_jams=0. Numeric top/bottom/left/right keys are silently ignored by the
 * actor (it falls back to its London-UK default box) — keep the string form.
 */
async function fetchApifyBurbn(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const box = boundingBox(lat, lng, radiusKm);
  const parsed = await runApifyActor(
    "apify_burbn",
    "burbn~waze-traffic-scraper",
    "timeout=120",
    {
      bottom_left: `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
      top_right: `${box.topRight.lat},${box.topRight.lng}`,
      max_alerts: 100,
      max_jams: 0,
    },
    140_000,
  );
  const rawItems = flattenApifyItems(parsed, "apify_burbn");
  const alerts = parseRawAlerts(rawItems, "apify_burbn");
  logger.debug(
    { provider: "apify_burbn", received: rawItems.length, retained: alerts.length },
    "Apify actor complete",
  );
  return alerts;
}

/**
 * Apify Actor mai_amm/waze-route-city-monitor (run-sync). City-mode schema:
 * locations[] with center + radiusKm. Bounding-box payloads (bottom_left/
 * top_right) hard-fail this actor. One dataset item per incident.
 */
async function fetchApifyMaiAmm(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const parsed = await runApifyActor(
    "apify_mai_amm",
    "mai_amm~waze-route-city-monitor",
    "timeout=120",
    {
      accessMode: "preview",
      sampleMode: false,
      allowSampleFallback: false,
      mode: "city",
      locations: [
        {
          latitude: lat,
          longitude: lng,
          radiusKm: Math.min(Math.max(radiusKm, 1), 100),
        },
      ],
      maxItems: 50,
      includeAlerts: true,
    },
    140_000,
  );
  const rawItems = flattenApifyItems(parsed, "apify_mai_amm");
  const alerts = parseRawAlerts(rawItems, "apify_mai_amm");
  logger.debug(
    { provider: "apify_mai_amm", received: rawItems.length, retained: alerts.length },
    "Apify actor complete",
  );
  return alerts;
}

/**
 * Apify Actor sian.agency/waze-traffic-scraper (run-sync). Returns flat,
 * geo-coded alert rows (alert_id, type, latitude, longitude, ...) tagged
 * recordType "alert" | "jam" — jams are filtered out. Typically completes in
 * ~10s but still routed through the non-blocking wrapper for safety.
 */
async function fetchApifySian(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const token = process.env["APIFY_API_TOKEN"];
  if (!token) throw new Error("APIFY_API_TOKEN is not configured");

  const box = boundingBox(lat, lng, radiusKm);
  const url =
    "https://api.apify.com/v2/acts/sian.agency~waze-traffic-scraper/run-sync-get-dataset-items" +
    "?timeout=120";
  const res = await timedProviderFetch("apify_sian", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      operation: "alertsAndJams",
      bottomLeft: `${box.bottomLeft.lat},${box.bottomLeft.lng}`,
      topRight: `${box.topRight.lat},${box.topRight.lng}`,
    }),
    signal: AbortSignal.timeout(140_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(
      { provider: "apify_sian", status: res.status, body: body.slice(0, 300) },
      "Provider request failed",
    );
    throw new Error(`apify_sian responded with status ${res.status}`);
  }

  logger.debug({ provider: "apify_sian", status: res.status }, "Provider responded");
  const parsed = (await res.json()) as unknown;
  const items = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  const rawAlerts = items.filter(
    (item) => item["recordType"] !== "jam" && typeof item["type"] === "string",
  );
  const alerts = parseRawAlerts(rawAlerts, "apify_sian");
  logger.debug(
    { provider: "apify_sian", received: items.length, retained: alerts.length },
    "Apify actor complete",
  );
  return alerts;
}

/**
 * Per-provider failure cooldowns so a dead/exhausted upstream isn't hammered
 * every 30s poll: 429 (quota exhausted) backs off 15 min, other failures
 * 30s so transient network blips recover on the next poll pass.
 */
const COOLDOWN_429_MS = 15 * 60 * 1000;
const COOLDOWN_ERROR_MS = 30 * 1000;
const cooldownUntil = new Map<ProviderSource, number>();

function noteProviderFailure(provider: ProviderSource, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const ms = msg.includes("429") ? COOLDOWN_429_MS : COOLDOWN_ERROR_MS;
  cooldownUntil.set(provider, Date.now() + ms);
  logger.warn(
    { provider, error: msg, cooldownSeconds: Math.round(ms / 1000) },
    "Provider fetch failed — cooling down",
  );
}

/**
 * Apify runs take 1-3 minutes — far longer than the 30s poll cadence — so the
 * aggregator never blocks on it. One actor run is kept in flight at a time;
 * each aggregation grabs whatever result it can within a short deadline and
 * otherwise uses the last completed (cached, ≤5 min old) result.
 */
const APIFY_SOFT_DEADLINE_MS = 20_000;
const APIFY_CACHE_TTL_MS = 5 * 60 * 1000;

function makeNonBlocking(
  provider: ProviderSource,
  fetcher: (lat: number, lng: number, radiusKm: number) => Promise<WazeAlert[]>,
): (lat: number, lng: number, radiusKm: number) => Promise<WazeAlert[]> {
  // Keyed by ~1km grid cell + radius so results for one search area are never
  // served for a different one (background polling iterates distinct cells).
  const inFlight = new Map<string, Promise<WazeAlert[]>>();
  const cache = new Map<string, { alerts: WazeAlert[]; at: number }>();

  return (lat, lng, radiusKm) => {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
    let run = inFlight.get(key);
    if (!run) {
      run = fetcher(lat, lng, radiusKm)
        .then((alerts) => {
          cache.set(key, { alerts, at: Date.now() });
          return alerts;
        })
        .catch((err: unknown) => {
          // Record the failure here (the soft deadline may already have won
          // the race, hiding this rejection from the aggregator) so cooldown
          // backoff still applies; resolve empty so callers never see a
          // rejection twice.
          noteProviderFailure(provider, err);
          return [];
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, run);
    }
    const deadline = new Promise<WazeAlert[]>((resolve) =>
      setTimeout(() => {
        const hit = cache.get(key);
        const fresh = hit && Date.now() - hit.at <= APIFY_CACHE_TTL_MS;
        if (fresh)
          logger.debug({ provider }, "Apify run still in flight — using cached result");
        resolve(fresh ? hit.alerts : []);
      }, APIFY_SOFT_DEADLINE_MS).unref?.(),
    );
    return Promise.race([run, deadline]);
  };
}

const PROVIDER_FETCHERS: Record<
  ProviderSource,
  (lat: number, lng: number, radiusKm: number) => Promise<WazeAlert[]>
> = {
  waze_direct: fetchWazeDirect,
  openwebninja: fetchOpenWebNinja,
  blocksinside: fetchBlocksInside,
  cavsn: fetchCavsn,
  google_maps: fetchGoogleMaps,
  apify_phantom: makeNonBlocking("apify_phantom", fetchApifyPhantom),
  apify_sian: makeNonBlocking("apify_sian", fetchApifySian),
  apify_burbn: makeNonBlocking("apify_burbn", fetchApifyBurbn),
  apify_mai_amm: makeNonBlocking("apify_mai_amm", fetchApifyMaiAmm),
};

/**
 * Multi-provider aggregator: query all 4 sources simultaneously, tolerate
 * individual provider failures (a dead provider never blocks the others),
 * and dedup matching accidents across providers within 100 m — the copy from
 * the highest-priority provider is kept.
 */
/**
 * Temporarily paused providers: the four Apify actors are quota-blocked
 * (403 monthly hard limit) until the monthly reset — skipping them entirely
 * eliminates the 403 error noise and the 2-min cooldown churn in the poll
 * loop. Remove entries here to re-enable.
 */
const DISABLED_PROVIDERS = new Set<ProviderSource>([
  // Active race: blocksinside + openwebninja + cavsn (RapidAPI-only) run in
  // parallel each pass. Remove entries to re-enable other providers.
  "waze_direct",
  "apify_sian", // temporarily disabled — remove this line to rejoin the race
  "apify_phantom",
  "apify_burbn",
  "apify_mai_amm",
]);

export async function fetchWazeAlerts(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<WazeAlert[]> {
  const now = Date.now();
  const active = PROVIDER_PRIORITY.filter((p) => {
    if (DISABLED_PROVIDERS.has(p)) return false;
    const until = cooldownUntil.get(p) ?? 0;
    if (until > now) {
      logger.debug(
        { provider: p, remainingSeconds: Math.ceil((until - now) / 1000) },
        "Provider skipped — cooling down",
      );
      return false;
    }
    return true;
  });
  logger.debug(
    { active: active.length, total: PROVIDER_PRIORITY.length, lat, lng, radiusKm },
    "Aggregating providers",
  );
  // Stagger launches so the providers never fire on the exact same
  // millisecond (rate-limiter friendliness + spreads local socket/DNS work);
  // they still run concurrently after their offset.
  const settled = await Promise.allSettled(
    active.map(async (p, i) => {
      if (i > 0) await sleep(i * PROVIDER_STAGGER_MS);
      return PROVIDER_FETCHERS[p](lat, lng, radiusKm);
    }),
  );

  const byProvider = new Map<ProviderSource, WazeAlert[]>();
  settled.forEach((result, i) => {
    const provider = active[i]!;
    if (result.status === "fulfilled") {
      logger.debug({ provider, alerts: result.value.length }, "Provider returned alerts");
      byProvider.set(provider, result.value);
    } else {
      noteProviderFailure(provider, result.reason);
    }
  });
  if (active.length > 0 && byProvider.size === 0) {
    throw new Error("All providers failed to return alerts");
  }

  // Cross-provider proximity dedup: every surviving alert is a crash (the
  // parser's early filter guarantees it), so walk providers in priority
  // order and drop a crash when a kept crash from an EARLIER provider sits
  // within the intersection-level dedup radius (~50 m).
  const kept: WazeAlert[] = [];
  for (const provider of PROVIDER_PRIORITY) {
    for (const alert of byProvider.get(provider) ?? []) {
      // google_maps carries no alert ids and wobbles coordinates ~100m
      // between polls, so its rows match against kept alerts within 250m;
      // id-carrying providers keep the tight 50m intersection-level radius.
      const dup = kept.find((k) => {
        if (k.provider === alert.provider) return false;
        const radiusKm =
          alert.provider === "google_maps" || k.provider === "google_maps"
            ? GOOGLE_MAPS_DEDUP_RADIUS_KM
            : DEDUP_RADIUS_KM;
        return distanceKm(k.lat, k.lng, alert.lat, alert.lng) <= radiusKm;
      });
      if (dup) {
        const radiusM =
          alert.provider === "google_maps" || dup.provider === "google_maps"
            ? GOOGLE_MAPS_DEDUP_RADIUS_KM * 1000
            : DEDUP_RADIUS_KM * 1000;
        logger.info(
          {
            provider: alert.provider,
            street: alert.street ?? "?",
            matchedProvider: dup.provider,
            withinMeters: radiusM,
          },
          "Deduped cross-provider accident",
        );
        continue;
      }
      kept.push(alert);
    }
  }
  logger.info(
    { kept: kept.length, responded: byProvider.size, total: PROVIDER_PRIORITY.length },
    "Aggregator pass complete",
  );
  return kept;
}
