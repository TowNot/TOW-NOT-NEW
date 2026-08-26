/**
 * Waterloo Region (Kitchener / Waterloo / Cambridge) Icecast feeds from CYKF.
 *
 * Sources inspected 2026-08-26:
 * - Fire page https://cykf.net/fire/ → FWDRAP playlist decrypts to AsuraHosting MP3 proxy
 * - EMS page https://cykf.net/ems-2/ → playlist currently encrypts to a placeholder
 *   ("They_Encrypted_Their_System_Sorry_No_Audio") — no public mount exposed
 *
 * Keep `enabled: false` while London-only ops are active. radioOrchestrator
 * skips these until you flip enabled + lift LONDON_ONLY_INGEST for waterloo.
 */

export type WaterlooRadioAgency = "fire" | "ems";

export interface WaterlooRegionRadioFeed {
  id: string;
  /** Zone id used for geocoding / incident tagging when this feed posts. */
  zoneId: string;
  /** Master switch — must be true AND zone ingest allowed before Icecast starts. */
  enabled: boolean;
  agency: WaterlooRadioAgency;
  /** Empty when CYKF has not published a live mount. */
  url: string;
  description: string;
  /** Extra STT gate phrases for this feed (merged with global crash/EMS lists). */
  keywordTriggers: string[];
}

export const WATERLOO_REGION_RADIO_FEEDS: WaterlooRegionRadioFeed[] = [
  {
    id: "waterlooRegionFire",
    zoneId: "waterloo",
    enabled: false,
    agency: "fire",
    url: "https://cast5.asurahosting.com/proxy/fire12/stream?type=.mp3",
    description: "Waterloo Region Fire Dispatch (CYKF)",
    keywordTriggers: ["MVC", "motor vehicle collision", "extrication", "pump"],
  },
  {
    id: "waterlooRegionEms",
    zoneId: "waterloo",
    // CYKF currently withholds the live EMS mount (encrypted placeholder on page).
    enabled: false,
    agency: "ems",
    url: "",
    description: "Waterloo Region EMS Dispatch (CYKF)",
    keywordTriggers: ["Code 3", "Code 4", "MVC", "collision"],
  },
];
