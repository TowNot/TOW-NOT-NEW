/** London-proven half-span for every Southern Ontario coverage box. */
export const ZONE_LAT_HALF = 0.09;
export const ZONE_LNG_HALF = 0.123;

/** Broadcastify HLS playlist feed (stable public origin). */
export interface ZoneHlsAudio {
  enabled: boolean;
  type: "hls";
  /** Null = pending / locked-down — orchestrator skips audio, Waze still polls. */
  feedId: number | null;
  description: string;
}

/** Continuous Icecast/MP3 stream (e.g. CYKF Waterloo Region). */
export interface ZoneStreamAudio {
  enabled: boolean;
  type: "stream";
  url: string;
  description: string;
  /** Optional agency hint when a zone stream is dedicated (fire vs ems). */
  agency?: "fire" | "ems";
  /** Optional extra STT gate phrases for this stream. */
  keywordTriggers?: string[];
}

export type ZoneAudio = ZoneHlsAudio | ZoneStreamAudio;

export interface CoverageZoneDef {
  id: string;
  name: string;
  enabled: boolean;
  bounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  /** Single stable audio source for this zone, if any. */
  audio: ZoneAudio | null;
  /** Agencies audible on this zone's radio feed (for UI transparency). */
  scannedAgencies: string[];
  /** True when the zone audio stream includes EMS (CYKF Waterloo Region). */
  hasEmsFeed: boolean;
}

interface ZoneSeed {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  enabled?: boolean;
  audio?: ZoneAudio | null;
  scannedAgencies?: string[];
  hasEmsFeed?: boolean;
}

/** Pending HLS — feed TBD. Zone can still be enabled for Waze without starting audio. */
function hlsPending(description: string): ZoneHlsAudio {
  return {
    enabled: false,
    type: "hls",
    feedId: null,
    description,
  };
}

function boundsFromCenter(center: { lat: number; lng: number }): CoverageZoneDef["bounds"] {
  return {
    southWest: {
      lat: center.lat - ZONE_LAT_HALF,
      lng: center.lng - ZONE_LNG_HALF,
    },
    northEast: {
      lat: center.lat + ZONE_LAT_HALF,
      lng: center.lng + ZONE_LNG_HALF,
    },
  };
}

import { isIngestZoneAllowed } from "./londonOnly";

function buildZone(seed: ZoneSeed): CoverageZoneDef {
  // seed.enabled + optional LONDON_ONLY_INGEST=1 lock radio/CAD only.
  // Waze/GMaps demand is Prisma selectedCity (activeMonitoredCities).
  const enabled = isIngestZoneAllowed(seed.id) && seed.enabled === true;
  let audio = seed.audio ?? null;
  // Keep feedId/URL for later, but pause audio so radio never starts while zone is off.
  if (audio && !enabled) {
    audio = { ...audio, enabled: false };
  }
  return {
    id: seed.id,
    name: seed.name,
    enabled,
    bounds: boundsFromCenter(seed.center),
    audio,
    scannedAgencies: seed.scannedAgencies ?? [],
    hasEmsFeed: seed.hasEmsFeed === true,
  };
}

/**
 * Southern Ontario coverage catalog (geometry + optional radio feeds).
 * Waze / Google Maps: Prisma `selectedCity` demand (any catalog city).
 * Fire / EMS: starts when demanded AND zone/audio is enabled with a real feed.
 * Pending cities (feedId null) stay maps-only until a feed is assigned.
 */
const ZONE_SEEDS: ZoneSeed[] = [
  // ── Catalog (scrapers follow user profiles; radio uses enabled) ─────
  {
    id: "london",
    name: "London",
    center: { lat: 42.9849, lng: -81.2453 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 34296,
      description: "London Fire",
    },
    scannedAgencies: ["Fire", "Public Works"],
  },
  {
    id: "brampton",
    name: "Brampton",
    center: { lat: 43.6833, lng: -79.7667 },
    enabled: true,
    audio: hlsPending("Brampton Fire (feed TBD)"),
    scannedAgencies: [],
  },
  // ── Other catalog cities (Waze/GMaps when selectedCity demands them) ─
  {
    id: "milton",
    name: "Milton",
    center: { lat: 43.5167, lng: -79.8833 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 43263,
      description: "Halton Hills / Milton Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "haltonHills",
    name: "Halton Hills",
    center: { lat: 43.6475, lng: -79.9197 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 43263,
      description: "Halton Hills / Milton Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "kitchener",
    name: "Kitchener",
    center: { lat: 43.4587, lng: -80.5129 },
    enabled: true,
    // Regional Fire Icecast (CYKF). EMS mount still encrypted / unpublished.
    audio: {
      enabled: true,
      type: "stream",
      url: "https://cast5.asurahosting.com/proxy/fire12/stream?type=.mp3",
      description: "Waterloo Region Fire Dispatch (CYKF)",
      agency: "fire",
      keywordTriggers: ["MVC", "motor vehicle collision", "extrication", "pump"],
    },
    hasEmsFeed: true,
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "waterloo",
    name: "Waterloo",
    center: { lat: 43.4643, lng: -80.5204 },
    enabled: true,
    audio: {
      enabled: true,
      type: "stream",
      url: "https://cast5.asurahosting.com/proxy/fire12/stream?type=.mp3",
      description: "Waterloo Region Fire Dispatch (CYKF)",
      agency: "fire",
      keywordTriggers: ["MVC", "motor vehicle collision", "extrication", "pump"],
    },
    hasEmsFeed: true,
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "cambridge",
    name: "Cambridge",
    center: { lat: 43.3972, lng: -80.3114 },
    enabled: true,
    audio: {
      enabled: true,
      type: "stream",
      url: "https://cast5.asurahosting.com/proxy/fire12/stream?type=.mp3",
      description: "Waterloo Region Fire Dispatch (CYKF)",
      agency: "fire",
      keywordTriggers: ["MVC", "motor vehicle collision", "extrication", "pump"],
    },
    hasEmsFeed: true,
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "torontoCore",
    name: "Toronto (Core)",
    center: { lat: 43.6532, lng: -79.3832 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 3140,
      description: "Toronto Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "etobicoke",
    name: "Etobicoke",
    center: { lat: 43.6205, lng: -79.5132 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 3140,
      description: "Toronto Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "northYork",
    name: "North York",
    center: { lat: 43.7615, lng: -79.4111 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 3140,
      description: "Toronto Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "scarborough",
    name: "Scarborough",
    center: { lat: 43.7731, lng: -79.2577 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 3140,
      description: "Toronto Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "hamilton",
    name: "Hamilton",
    center: { lat: 43.2557, lng: -79.8711 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 16067,
      description: "Hamilton Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "burlington",
    name: "Burlington",
    center: { lat: 43.3255, lng: -79.799 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 43618,
      description: "Burlington Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "brantford",
    name: "Brantford",
    center: { lat: 43.1408, lng: -80.2632 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 45442,
      description: "Brantford Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "barrie",
    name: "Barrie",
    center: { lat: 44.3894, lng: -79.6903 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 36856,
      description: "Barrie Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "windsor",
    name: "Windsor",
    center: { lat: 42.3149, lng: -83.0364 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 14639,
      description: "Windsor Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "chatham",
    name: "Chatham-Kent",
    center: { lat: 42.4048, lng: -82.191 },
    enabled: true,
    audio: {
      enabled: true,
      type: "hls",
      feedId: 33309,
      description: "Chatham-Kent Fire",
    },
    scannedAgencies: ["Fire"],
  },

  // ── Pending audio (feedId null) — maps-only until a feed is assigned ─
  {
    id: "mississauga",
    name: "Mississauga",
    center: { lat: 43.589, lng: -79.6441 },
    enabled: false,
    audio: hlsPending("Mississauga Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "caledon",
    name: "Caledon",
    center: { lat: 43.8643, lng: -79.9984 },
    enabled: false,
    audio: hlsPending("Caledon Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "vaughan",
    name: "Vaughan",
    center: { lat: 43.8361, lng: -79.4983 },
    enabled: false,
    audio: hlsPending("Vaughan Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "richmondHill",
    name: "Richmond Hill",
    center: { lat: 43.8828, lng: -79.4403 },
    enabled: false,
    audio: hlsPending("Richmond Hill Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "newmarket",
    name: "Newmarket / Aurora",
    center: { lat: 44.0592, lng: -79.4613 },
    enabled: false,
    audio: hlsPending("Newmarket / Aurora Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "markham",
    name: "Markham",
    center: { lat: 43.8561, lng: -79.337 },
    enabled: false,
    audio: hlsPending("Markham Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "pickering",
    name: "Pickering",
    center: { lat: 43.8384, lng: -79.0868 },
    enabled: false,
    audio: hlsPending("Pickering Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "ajax",
    name: "Ajax",
    center: { lat: 43.8509, lng: -79.0204 },
    enabled: false,
    audio: hlsPending("Ajax Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "whitby",
    name: "Whitby",
    center: { lat: 43.8971, lng: -78.9422 },
    enabled: false,
    audio: hlsPending("Whitby Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "oshawa",
    name: "Oshawa",
    center: { lat: 43.8971, lng: -78.8658 },
    enabled: false,
    audio: hlsPending("Oshawa Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "bowmanville",
    name: "Bowmanville / Clarington",
    center: { lat: 43.9103, lng: -78.6874 },
    enabled: false,
    audio: hlsPending("Bowmanville / Clarington Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "stCatharines",
    name: "St. Catharines",
    center: { lat: 43.1594, lng: -79.2469 },
    enabled: false,
    audio: hlsPending("St. Catharines Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "niagaraFalls",
    name: "Niagara Falls",
    center: { lat: 43.0896, lng: -79.0849 },
    enabled: false,
    audio: hlsPending("Niagara Falls Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "fortErie",
    name: "Fort Erie",
    center: { lat: 42.9022, lng: -78.9185 },
    enabled: false,
    audio: hlsPending("Fort Erie Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "grimsby",
    name: "Grimsby",
    center: { lat: 43.1945, lng: -79.5601 },
    enabled: false,
    audio: hlsPending("Grimsby Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "lincoln",
    name: "Lincoln / Beamsville",
    center: { lat: 43.161, lng: -79.4795 },
    enabled: false,
    audio: hlsPending("Lincoln / Beamsville Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "niagaraOnTheLake",
    name: "Niagara-on-the-Lake",
    center: { lat: 43.255, lng: -79.0773 },
    enabled: false,
    audio: hlsPending("Niagara-on-the-Lake Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "oakville",
    name: "Oakville",
    center: { lat: 43.4675, lng: -79.6877 },
    enabled: false,
    audio: hlsPending("Oakville Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "woodstock",
    name: "Woodstock",
    center: { lat: 43.1306, lng: -80.7467 },
    enabled: false,
    audio: hlsPending("Woodstock Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "guelph",
    name: "Guelph",
    center: { lat: 43.5448, lng: -80.2482 },
    enabled: false,
    audio: hlsPending("Guelph Fire (feed TBD)"),
    scannedAgencies: [],
  },
];

export const COVERAGE_ZONES: CoverageZoneDef[] = ZONE_SEEDS.map(buildZone);

export const COVERAGE_ZONE_IDS = COVERAGE_ZONES.map((zone) => zone.id);

export function getCoverageZone(id: string): CoverageZoneDef | undefined {
  return COVERAGE_ZONES.find((zone) => zone.id === id);
}

/** Public zone summary for status / frontend (no secrets). */
export function zonePublicSummaries(): Array<{
  id: string;
  name: string;
  enabled: boolean;
  scannedAgencies: string[];
  hasFireFeed: boolean;
  hasEmsFeed: boolean;
  audio:
    | { type: "hls"; feedId: number | null; description: string; enabled: boolean }
    | { type: "stream"; url: string; description: string; enabled: boolean }
    | null;
}> {
  return COVERAGE_ZONES.map((zone) => {
    const hasFireFeed =
      zone.audio != null &&
      zone.audio.enabled &&
      (zone.audio.type === "stream" ||
        (zone.audio.type === "hls" && zone.audio.feedId != null));
    return {
      id: zone.id,
      name: zone.name,
      enabled: zone.enabled,
      scannedAgencies: [...zone.scannedAgencies],
      hasFireFeed,
      hasEmsFeed: zone.hasEmsFeed,
      audio: zone.audio
        ? zone.audio.type === "hls"
          ? {
              type: "hls" as const,
              feedId: zone.audio.feedId,
              description: zone.audio.description,
              enabled: zone.audio.enabled,
            }
          : {
              type: "stream" as const,
              url: zone.audio.url,
              description: zone.audio.description,
              enabled: zone.audio.enabled,
            }
        : null,
    };
  });
}
