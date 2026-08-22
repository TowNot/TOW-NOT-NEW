/** London-proven half-span for every Southern Ontario coverage box. */
export const ZONE_LAT_HALF = 0.09;
export const ZONE_LNG_HALF = 0.123;

export interface CoverageZoneDef {
  id: string;
  name: string;
  enabled: boolean;
  bounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  };
  audio: {
    enabled: boolean;
    url: string;
    description: string;
  };
}

interface ZoneSeed {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  /** Only London is enabled for live polling. */
  enabled?: boolean;
  /** Only London runs the fire-dispatch audio listener. */
  audioEnabled?: boolean;
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
  const enabled = seed.enabled === true;
  const audioEnabled = seed.audioEnabled === true;
  return {
    id: seed.id,
    name: seed.name,
    enabled,
    bounds: boundsFromCenter(seed.center),
    audio: {
      enabled: audioEnabled,
      url: "",
      description: `${seed.name} Fire`,
    },
  };
}

/** Southern Ontario expansion list — London is the sole active zone today. */
const ZONE_SEEDS: ZoneSeed[] = [
  { id: "london", name: "London", center: { lat: 42.9849, lng: -81.2453 }, enabled: true, audioEnabled: true },
  { id: "woodstock", name: "Woodstock", center: { lat: 43.1306, lng: -80.7467 } },
  { id: "kitchener", name: "Kitchener / Waterloo", center: { lat: 43.4587, lng: -80.5129 } },
  { id: "cambridge", name: "Cambridge", center: { lat: 43.3972, lng: -80.3114 } },
  { id: "milton", name: "Milton", center: { lat: 43.5167, lng: -79.8833 } },
  { id: "mississauga", name: "Mississauga", center: { lat: 43.589, lng: -79.6441 } },
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
  { id: "markham", name: "Markham", center: { lat: 43.8561, lng: -79.337 } },
  { id: "bowmanville", name: "Bowmanville / Clarington", center: { lat: 43.9103, lng: -78.6874 } },
  { id: "windsor", name: "Windsor", center: { lat: 42.3149, lng: -83.0364 } },
  { id: "chatham", name: "Chatham-Kent", center: { lat: 42.4048, lng: -82.191 } },
  { id: "brampton", name: "Brampton", center: { lat: 43.6833, lng: -79.7667 } },
];

export const COVERAGE_ZONES: CoverageZoneDef[] = ZONE_SEEDS.map(buildZone);

export const COVERAGE_ZONE_IDS = COVERAGE_ZONES.map((zone) => zone.id);
