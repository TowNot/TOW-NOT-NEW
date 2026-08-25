import { COVERAGE_ZONES, getZone, type ZoneId } from "../lib/zones";

export function ZoneSwitcher({
  value,
  onChange,
}: {
  value: ZoneId;
  onChange: (id: ZoneId) => void;
}) {
  const active = getZone(value);
  const firePending = active ? !active.hasFireFeed : false;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1.5">
        <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-gray-500 sm:inline">
          Zone
        </span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as ZoneId)}
          className="max-w-[14rem] bg-transparent text-sm font-semibold text-cobalt outline-none sm:max-w-none"
          aria-label="Active coverage zone"
        >
          {COVERAGE_ZONES.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.hasFireFeed ? zone.name : `${zone.name} · Fire soon`}
            </option>
          ))}
        </select>
      </label>
      {firePending && active ? (
        <span
          className="inline-flex cursor-default items-center rounded-md border border-dashed border-line bg-ink px-2.5 py-1.5 font-mono text-[10px] font-medium text-gray-500"
          title={`${active.name} fire audio is not configured yet`}
          role="status"
          aria-live="polite"
        >
          {active.name} Fire coming soon
        </span>
      ) : null}
    </div>
  );
}
