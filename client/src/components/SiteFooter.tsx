import { FOOTER_TAGLINE } from "../design/copy";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/acceptable-use", label: "Acceptable Use Policy" },
] as const;

export function SiteFooter({ dark = false }: { dark?: boolean }) {
  if (dark) {
    return (
      <footer className="landing-footer">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">AlertNav</p>
            <p className="mt-1 text-xs text-indigo-100/65">{FOOTER_TAGLINE}</p>
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
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cobalt">AlertNav</p>
          <p className="mt-1 text-xs text-gray-500">{FOOTER_TAGLINE}</p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legal">
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs font-medium text-gray-600 no-underline hover:text-cobalt"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
