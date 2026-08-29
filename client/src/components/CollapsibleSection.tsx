import { useId, useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="collapsible-panel">
      <button
        type="button"
        className="collapsible-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="collapsible-trigger-text">
          <span className="collapsible-title">{title}</span>
          {subtitle ? <span className="collapsible-subtitle">{subtitle}</span> : null}
        </span>
        <span className={`collapsible-chevron ${open ? "collapsible-chevron-open" : ""}`} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div id={panelId} className="collapsible-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}
