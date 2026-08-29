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

  const chipClass = dark
    ? "header-chip header-chip-dark gap-2 rounded-full px-3"
    : "header-chip gap-2 rounded-full border border-line bg-surface px-3";

  const labelClass = dark
    ? "text-[11px] font-semibold uppercase tracking-widest text-indigo-200/70"
    : "text-[11px] font-semibold uppercase tracking-widest text-muted";

  const selectClass = dark
    ? "max-w-[10rem] bg-transparent text-center text-sm font-semibold text-white outline-none"
    : "max-w-[10rem] bg-transparent text-center text-sm font-semibold text-brand outline-none";

  const pendingClass = dark
    ? "header-chip header-chip-dark rounded-full px-3 font-mono text-[10px] font-medium"
    : "header-chip rounded-full border border-dashed border-line bg-surface-muted px-3 font-mono text-[10px] font-medium text-muted";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={chipClass}>
        <span className={labelClass}>Zone</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as ZoneId)}
          className={selectClass}
          aria-label="Active coverage zone"
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
          className={pendingClass}
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
