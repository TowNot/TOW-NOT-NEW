import { getZone, selectableCoverageZones, type ZoneId } from "../lib/zones";

export function ZoneSwitcher({
  value,
  onChange,
  dark = false,
}: {
  value: ZoneId;
  onChange: (id: ZoneId) => void;
  dark?: boolean;
}) {
  const active = getZone(value);
  const firePending = active ? !active.hasFireFeed : false;
  const zones = selectableCoverageZones();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className={
          dark
            ? "header-chip header-chip-dark inline-flex items-center gap-2 rounded-full px-2 py-1.5"
            : "inline-flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1.5"
        }
      >
        <span
          className={
            dark
              ? "hidden text-[11px] font-semibold uppercase tracking-widest text-indigo-100/70 sm:inline"
              : "hidden text-[11px] font-semibold uppercase tracking-widest text-gray-500 sm:inline"
          }
        >
          Zone
        </span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as ZoneId)}
          className={
            dark
              ? "max-w-[14rem] bg-transparent text-sm font-semibold text-white outline-none sm:max-w-none"
              : "max-w-[14rem] bg-transparent text-sm font-semibold text-cobalt outline-none sm:max-w-none"
          }
          aria-label="Active city (one at a time)"
        >
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.hasFireFeed ? zone.name : `${zone.name} · Fire soon`}
            </option>
          ))}
        </select>
      </label>
      {firePending && active ? (
        <span
          className="inline-flex max-w-[10rem] cursor-default items-center truncate rounded-md border border-dashed border-line bg-ink px-2 py-1.5 font-mono text-[10px] font-medium text-gray-500 sm:max-w-none"
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
