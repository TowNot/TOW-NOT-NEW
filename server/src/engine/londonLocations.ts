export interface LondonLocation {
  label: string;
  latitude: number;
  longitude: number;
}

export const LONDON_ON_LOCATIONS: readonly LondonLocation[] = [
  { label: "Wellington Rd & Commissioners Rd", latitude: 42.9391, longitude: -81.2214 },
  { label: "Oxford St E & Highbury Ave", latitude: 42.9896, longitude: -81.2218 },
  { label: "Richmond St & Oxford St", latitude: 42.9876, longitude: -81.2501 },
  { label: "Wonderland Rd & Southdale Rd", latitude: 42.9398, longitude: -81.2896 },
  { label: "Adelaide St N & Dundas St", latitude: 42.9872, longitude: -81.2267 },
  { label: "Veterans Memorial Pkwy & Hamilton Rd", latitude: 42.9684, longitude: -81.1732 },
  { label: "Highway 401 & Highbury Ave", latitude: 42.9285, longitude: -81.2079 },
  { label: "Western Rd & Sarnia Rd", latitude: 43.0098, longitude: -81.2764 },
  { label: "Wharncliffe Rd & Horton St", latitude: 42.9784, longitude: -81.2569 },
  { label: "Fanshawe Park Rd & Richmond St", latitude: 43.0306, longitude: -81.2648 },
  { label: "Wellington St & Dundas St", latitude: 42.9836, longitude: -81.2461 },
  { label: "Hyde Park Rd & Oxford St W", latitude: 42.9889, longitude: -81.3174 },
] as const;

export function pickLocation(indexSeed: number): LondonLocation {
  return LONDON_ON_LOCATIONS[Math.abs(indexSeed) % LONDON_ON_LOCATIONS.length];
}

export function jitter(value: number, amount = 0.004): number {
  return Number((value + (Math.random() - 0.5) * amount).toFixed(6));
}
