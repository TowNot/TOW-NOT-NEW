/**
 * Toronto Fire Services Active Incidents — live CAD XML client.
 * Official page loads the same feed: https://www.toronto.ca/data/fire/livecad.xml
 */
export const TORONTO_FIRE_CAD_XML_URL = "https://www.toronto.ca/data/fire/livecad.xml";
export const TORONTO_FIRE_CAD_PAGE_URL =
  "https://www.toronto.ca/community-people/public-safety-alerts/alerts-notifications/toronto-fire-active-incidents/";

export type TorontoFireCadEvent = {
  primeStreet: string;
  crossStreets: string;
  dispatchTime: string;
  eventNum: string;
  eventType: string;
  alarmLevel: string;
  beat: string;
  units: string;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tagValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXmlEntities(match[1] ?? "") : "";
}

export function parseTorontoFireCadXml(xml: string): TorontoFireCadEvent[] {
  const events: TorontoFireCadEvent[] = [];
  const re = /<event>([\s\S]*?)<\/event>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const eventNum = tagValue(block, "event_num");
    if (!eventNum) continue;
    events.push({
      primeStreet: tagValue(block, "prime_street"),
      crossStreets: tagValue(block, "cross_streets"),
      dispatchTime: tagValue(block, "dispatch_time"),
      eventNum,
      eventType: tagValue(block, "event_type"),
      alarmLevel: tagValue(block, "alarm_lev"),
      beat: tagValue(block, "beat"),
      units: tagValue(block, "units_disp"),
    });
  }
  return events;
}

export async function fetchTorontoFireCadEvents(
  fetchImpl: typeof fetch = fetch,
): Promise<TorontoFireCadEvent[]> {
  const url = `${TORONTO_FIRE_CAD_XML_URL}?${Date.now().toString(36)}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/xml,text/xml,*/*",
      "User-Agent": "AlertNav-TorontoFireCad/1.0",
      Referer: TORONTO_FIRE_CAD_PAGE_URL,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Toronto Fire CAD fetch failed (${response.status})`);
  }
  const xml = await response.text();
  return parseTorontoFireCadXml(xml);
}
