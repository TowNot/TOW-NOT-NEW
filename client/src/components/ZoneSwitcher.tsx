import { COVERAGE_ZONES, type ZoneId } from "../lib/zones";

export function ZoneSwitcher({
  value,
  onChange,
}: {
  value: ZoneId;
  onChange: (id: ZoneId) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1.5">
      <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-gray-500 sm:inline">
        Zone
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ZoneId)}
        className="bg-transparent text-sm font-semibold text-cobalt outline-none"
        aria-label="Active coverage zone"
      >
        {COVERAGE_ZONES.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name}
          </option>
        ))}
      </select>
    </label>
  );
}
