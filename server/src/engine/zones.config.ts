/** London-proven half-span for every Southern Ontario coverage box. */
export const ZONE_LAT_HALF = 0.09;
export const ZONE_LNG_HALF = 0.123;

export interface ZoneStreamAudioSource {
  enabled: boolean;
  type: "stream";
  url: string;
  description: string;
}

export interface ZoneCallsAudioSource {
  enabled: boolean;
  type: "calls";
  nodeId: number;
  talkgroups: number[];
  description: string;
}

export type ZoneAudioSource = ZoneStreamAudioSource | ZoneCallsAudioSource;

export interface CoverageZoneDef {
  id: string;
  name: string;
  enabled: boolean;
  bounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  audioSources: ZoneAudioSource[];
}

interface ZoneSeed {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  enabled?: boolean;
  audioSources?: ZoneAudioSource[];
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
    audioSources: seed.audioSources ?? [],
  };
}

/** Southern Ontario expansion list — enable zones individually for Waze + audio. */
const ZONE_SEEDS: ZoneSeed[] = [
  {
    id: "london",
    name: "London",
    center: { lat: 42.9849, lng: -81.2453 },
    enabled: true,
    audioSources: [
      {
        enabled: true,
        type: "stream",
        url: "https://broadcastify.cdnstream1.com/34296",
        description: "London Stream",
      },
      {
        enabled: false,
        type: "calls",
        nodeId: 6294,
        talkgroups: [],
        description: "London Calls",
      },
    ],
  },
  {
    id: "woodstock",
    name: "Woodstock",
    center: { lat: 43.1306, lng: -80.7467 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "calls",
        nodeId: 6293,
        talkgroups: [],
        description: "Oxford County Calls",
      },
    ],
  },
  {
    id: "kitchener",
    name: "Kitchener / Waterloo",
    center: { lat: 43.4587, lng: -80.5129 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "stream",
        url: "http://cykf.net:8000/scanner",
        description: "Waterloo Region Stream",
      },
    ],
  },
  {
    id: "guelph",
    name: "Guelph",
    center: { lat: 43.5448, lng: -80.2482 },
    enabled: false,
    audioSources: [],
  },
  {
    id: "cambridge",
    name: "Cambridge",
    center: { lat: 43.3972, lng: -80.3114 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "stream",
        url: "http://cykf.net:8000/scanner",
        description: "Waterloo Region Stream",
      },
    ],
  },
  {
    id: "milton",
    name: "Milton",
    center: { lat: 43.5167, lng: -79.8833 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "stream",
        url: "https://broadcastify.cdnstream1.com/43263",
        description: "Halton Hills / Milton Stream",
      },
    ],
  },
  {
    id: "haltonHills",
    name: "Halton Hills",
    center: { lat: 43.6475, lng: -79.9197 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "stream",
        url: "https://broadcastify.cdnstream1.com/43263",
        description: "Halton Hills / Milton Stream",
      },
    ],
  },
  {
    id: "mississauga",
    name: "Mississauga",
    center: { lat: 43.589, lng: -79.6441 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "calls",
        nodeId: 4158,
        talkgroups: [],
        description: "Peel Region Calls",
      },
    ],
  },
  { id: "torontoCore", name: "Toronto (Core)", center: { lat: 43.6532, lng: -79.3832 } },
  { id: "etobicoke", name: "Etobicoke", center: { lat: 43.6205, lng: -79.5132 } },
  { id: "northYork", name: "North York", center: { lat: 43.7615, lng: -79.4111 } },
  { id: "scarborough", name: "Scarborough", center: { lat: 43.7731, lng: -79.2577 } },
  { id: "pickering", name: "Pickering", center: { lat: 43.8384, lng: -79.0868 } },
  { id: "ajax", name: "Ajax", center: { lat: 43.8509, lng: -79.0204 } },
  { id: "whitby", name: "Whitby", center: { lat: 43.8971, lng: -78.9422 } },
  { id: "oshawa", name: "Oshawa", center: { lat: 43.8971, lng: -78.8658 } },
  { id: "hamilton", name: "Hamilton", center: { lat: 43.2557, lng: -79.8711 } },
  { id: "burlington", name: "Burlington", center: { lat: 43.3255, lng: -79.799 } },
  { id: "oakville", name: "Oakville", center: { lat: 43.4675, lng: -79.6877 } },
  { id: "grimsby", name: "Grimsby", center: { lat: 43.1945, lng: -79.5601 } },
  { id: "lincoln", name: "Lincoln / Beamsville", center: { lat: 43.161, lng: -79.4795 } },
  { id: "stCatharines", name: "St. Catharines", center: { lat: 43.1594, lng: -79.2469 } },
  { id: "niagaraOnTheLake", name: "Niagara-on-the-Lake", center: { lat: 43.255, lng: -79.0773 } },
  { id: "niagaraFalls", name: "Niagara Falls", center: { lat: 43.0896, lng: -79.0849 } },
  { id: "fortErie", name: "Fort Erie", center: { lat: 42.9022, lng: -78.9185 } },
  { id: "brantford", name: "Brantford", center: { lat: 43.1408, lng: -80.2632 } },
  { id: "vaughan", name: "Vaughan", center: { lat: 43.8361, lng: -79.4983 } },
  { id: "richmondHill", name: "Richmond Hill", center: { lat: 43.8828, lng: -79.4403 } },
  { id: "newmarket", name: "Newmarket / Aurora", center: { lat: 44.0592, lng: -79.4613 } },
  { id: "markham", name: "Markham", center: { lat: 43.8561, lng: -79.337 } },
  { id: "caledon", name: "Caledon", center: { lat: 43.8643, lng: -79.9984 } },
  { id: "bowmanville", name: "Bowmanville / Clarington", center: { lat: 43.9103, lng: -78.6874 } },
  { id: "barrie", name: "Barrie", center: { lat: 44.3894, lng: -79.6903 } },
  { id: "windsor", name: "Windsor", center: { lat: 42.3149, lng: -83.0364 } },
  { id: "chatham", name: "Chatham-Kent", center: { lat: 42.4048, lng: -82.191 } },
  {
    id: "brampton",
    name: "Brampton",
    center: { lat: 43.6833, lng: -79.7667 },
    enabled: false,
    audioSources: [
      {
        enabled: false,
        type: "calls",
        nodeId: 4158,
        talkgroups: [],
        description: "Peel Region Calls",
      },
    ],
  },
];

export const COVERAGE_ZONES: CoverageZoneDef[] = ZONE_SEEDS.map(buildZone);

export const COVERAGE_ZONE_IDS = COVERAGE_ZONES.map((zone) => zone.id);

export function getCoverageZone(id: string): CoverageZoneDef | undefined {
  return COVERAGE_ZONES.find((zone) => zone.id === id);
}
