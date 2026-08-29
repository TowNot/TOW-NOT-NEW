const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/acceptable-use", label: "Acceptable Use Policy" },
] as const;

const APP_DESCRIPTION =
  "AlertNav is a community-driven traffic and road safety app that notifies users about nearby disruptions to help them better prepare for their commute and stay aware of local road conditions.";

export function SiteFooter({ dark = false }: { dark?: boolean }) {
  if (dark) {
    return (
      <footer className="landing-footer">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-white">AlertNav</p>
            <p className="mt-2 text-xs leading-relaxed text-indigo-100/65">{APP_DESCRIPTION}</p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legal">
            {LEGAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs font-medium text-indigo-100/65 no-underline hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <p className="text-sm font-semibold text-brand">AlertNav</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">{APP_DESCRIPTION}</p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legal">
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-medium text-muted no-underline hover:text-brand"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
