import type { PushZoneMode } from "../lib/zones";

export function PushZoneModeSwitcher({
  value,
  onChange,
}: {
  value: PushZoneMode;
  onChange: (mode: PushZoneMode) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1.5">
      <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-gray-500 sm:inline">
        Alerts
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PushZoneMode)}
        className="max-w-[11rem] bg-transparent text-sm font-semibold text-cobalt outline-none"
        aria-label="Push notification city scope"
      >
        <option value="current">Only Current City</option>
        <option value="all">All Enabled Cities</option>
      </select>
    </label>
  );
}
