/** London-proven half-span for every Southern Ontario coverage box. */
export const ZONE_LAT_HALF = 0.09;
export const ZONE_LNG_HALF = 0.123;

/** Broadcastify HLS playlist feed (stable public origin). */
export interface ZoneHlsAudio {
  enabled: boolean;
  type: "hls";
  /** Null = placeholder until a Broadcastify feed ID is assigned. */
  feedId: number | null;
  description: string;
}

/** Continuous Icecast/MP3 stream (e.g. CYKF Waterloo). */
export interface ZoneStreamAudio {
  enabled: boolean;
  type: "stream";
  url: string;
  description: string;
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
}

interface ZoneSeed {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  enabled?: boolean;
  audio?: ZoneAudio | null;
  scannedAgencies?: string[];
}

/** Placeholder HLS entry — fill in feedId later; never starts the listener. */
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

function buildZone(seed: ZoneSeed): CoverageZoneDef {
  return {
    id: seed.id,
    name: seed.name,
    enabled: seed.enabled === true,
    bounds: boundsFromCenter(seed.center),
    audio: seed.audio ?? null,
    scannedAgencies: seed.scannedAgencies ?? [],
  };
}

/**
 * Southern Ontario expansion list — enable zones individually for Waze + audio.
 * Centers / half-spans for existing cities must not be changed casually.
 */
const ZONE_SEEDS: ZoneSeed[] = [
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
    id: "woodstock",
    name: "Woodstock",
    center: { lat: 43.1306, lng: -80.7467 },
    enabled: false,
    audio: hlsPending("Woodstock Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "kitchener",
    name: "Kitchener / Waterloo",
    center: { lat: 43.4587, lng: -80.5129 },
    enabled: true,
    audio: {
      enabled: true,
      type: "stream",
      url: "http://cykf.net:8000/scanner",
      description: "Waterloo Region (CYKF)",
    },
    scannedAgencies: ["Fire", "EMS"],
  },
  {
    id: "guelph",
    name: "Guelph",
    center: { lat: 43.5448, lng: -80.2482 },
    enabled: false,
    audio: hlsPending("Guelph Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "cambridge",
    name: "Cambridge",
    center: { lat: 43.3972, lng: -80.3114 },
    enabled: true,
    // Same CYKF feed as Kitchener — orchestrator dedupes by URL.
    audio: {
      enabled: true,
      type: "stream",
      url: "http://cykf.net:8000/scanner",
      description: "Waterloo Region (CYKF)",
    },
    scannedAgencies: ["Fire", "EMS"],
  },
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
    // Same Broadcastify feed as Milton — orchestrator dedupes by feedId.
    audio: {
      enabled: true,
      type: "hls",
      feedId: 43263,
      description: "Halton Hills / Milton Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "mississauga",
    name: "Mississauga",
    center: { lat: 43.589, lng: -79.6441 },
    enabled: false,
    audio: hlsPending("Mississauga Fire (feed TBD)"),
    scannedAgencies: [],
  },
  {
    id: "torontoCore",
    name: "Toronto (Core)",
    center: { lat: 43.6532, lng: -79.3832 },
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
    audio: {
      enabled: true,
      type: "hls",
      feedId: 3140,
      description: "Toronto Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "pickering",
    name: "Pickering",
    center: { lat: 43.8384, lng: -79.0868 },
    audio: hlsPending("Pickering Fire (feed TBD)"),
  },
  {
    id: "ajax",
    name: "Ajax",
    center: { lat: 43.8509, lng: -79.0204 },
    audio: hlsPending("Ajax Fire (feed TBD)"),
  },
  {
    id: "whitby",
    name: "Whitby",
    center: { lat: 43.8971, lng: -78.9422 },
    audio: hlsPending("Whitby Fire (feed TBD)"),
  },
  {
    id: "oshawa",
    name: "Oshawa",
    center: { lat: 43.8971, lng: -78.8658 },
    audio: hlsPending("Oshawa Fire (feed TBD)"),
  },
  {
    id: "hamilton",
    name: "Hamilton",
    center: { lat: 43.2557, lng: -79.8711 },
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
    audio: {
      enabled: true,
      type: "hls",
      feedId: 43618,
      description: "Burlington Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "oakville",
    name: "Oakville",
    center: { lat: 43.4675, lng: -79.6877 },
    audio: hlsPending("Oakville Fire (feed TBD)"),
  },
  {
    id: "grimsby",
    name: "Grimsby",
    center: { lat: 43.1945, lng: -79.5601 },
    audio: hlsPending("Grimsby Fire (feed TBD)"),
  },
  {
    id: "lincoln",
    name: "Lincoln / Beamsville",
    center: { lat: 43.161, lng: -79.4795 },
    audio: hlsPending("Lincoln / Beamsville Fire (feed TBD)"),
  },
  {
    id: "stCatharines",
    name: "St. Catharines",
    center: { lat: 43.1594, lng: -79.2469 },
    audio: hlsPending("St. Catharines Fire (feed TBD)"),
  },
  {
    id: "niagaraOnTheLake",
    name: "Niagara-on-the-Lake",
    center: { lat: 43.255, lng: -79.0773 },
    audio: hlsPending("Niagara-on-the-Lake Fire (feed TBD)"),
  },
  {
    id: "niagaraFalls",
    name: "Niagara Falls",
    center: { lat: 43.0896, lng: -79.0849 },
    audio: hlsPending("Niagara Falls Fire (feed TBD)"),
  },
  {
    id: "fortErie",
    name: "Fort Erie",
    center: { lat: 42.9022, lng: -78.9185 },
    audio: hlsPending("Fort Erie Fire (feed TBD)"),
  },
  {
    id: "brantford",
    name: "Brantford",
    center: { lat: 43.1408, lng: -80.2632 },
    audio: {
      enabled: true,
      type: "hls",
      feedId: 45442,
      description: "Brantford Fire",
    },
    scannedAgencies: ["Fire"],
  },
  {
    id: "vaughan",
    name: "Vaughan",
    center: { lat: 43.8361, lng: -79.4983 },
    audio: hlsPending("Vaughan Fire (feed TBD)"),
  },
  {
    id: "richmondHill",
    name: "Richmond Hill",
    center: { lat: 43.8828, lng: -79.4403 },
    audio: hlsPending("Richmond Hill Fire (feed TBD)"),
  },
  {
    id: "newmarket",
    name: "Newmarket / Aurora",
    center: { lat: 44.0592, lng: -79.4613 },
    audio: hlsPending("Newmarket / Aurora Fire (feed TBD)"),
  },
  {
    id: "markham",
    name: "Markham",
    center: { lat: 43.8561, lng: -79.337 },
    audio: hlsPending("Markham Fire (feed TBD)"),
  },
  {
    id: "caledon",
    name: "Caledon",
    center: { lat: 43.8643, lng: -79.9984 },
    audio: hlsPending("Caledon Fire (feed TBD)"),
  },
  {
    id: "bowmanville",
    name: "Bowmanville / Clarington",
    center: { lat: 43.9103, lng: -78.6874 },
    audio: hlsPending("Bowmanville / Clarington Fire (feed TBD)"),
  },
  {
    id: "barrie",
    name: "Barrie",
    center: { lat: 44.3894, lng: -79.6903 },
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
    audio: hlsPending("Chatham-Kent Fire (feed TBD)"),
  },
  {
    id: "brampton",
    name: "Brampton",
    center: { lat: 43.6833, lng: -79.7667 },
    enabled: false,
    audio: hlsPending("Brampton Fire (feed TBD)"),
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
  audio:
    | { type: "hls"; feedId: number | null; description: string; enabled: boolean }
    | { type: "stream"; url: string; description: string; enabled: boolean }
    | null;
}> {
  return COVERAGE_ZONES.map((zone) => ({
    id: zone.id,
    name: zone.name,
    enabled: zone.enabled,
    scannedAgencies: [...zone.scannedAgencies],
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
  }));
}
