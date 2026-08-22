import { osmEmbedUrl, type CoverageZone } from "../lib/zones";

export function ZoneMap({ zone }: { zone: CoverageZone }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <iframe
        key={zone.id}
        title={`${zone.name} coverage map`}
        src={osmEmbedUrl(zone)}
        className="h-56 w-full border-0 md:h-72"
        loading="lazy"
      />
      <p className="px-4 py-2 text-xs text-gray-500">
        Centered on {zone.name}, {zone.region}
      </p>
    </div>
  );
}
