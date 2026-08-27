import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

interface LegalDocumentLayoutProps {
  title: string;
  effectiveDate?: string;
  children: ReactNode;
}

export function LegalDocumentLayout({
  title,
  effectiveDate = "August 27, 2026",
  children,
}: LegalDocumentLayoutProps) {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5">
          <a
            href="/"
            className="text-2xl font-bold tracking-tight text-cobalt no-underline md:text-3xl"
          >
            AlertNav
          </a>
          <a
            href="/"
            className="rounded-md border border-cobalt/30 bg-white px-3 py-2 text-xs font-semibold text-cobalt no-underline hover:bg-ink sm:px-4 sm:text-sm"
          >
            Back to Home
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 pb-16 sm:py-12">
        <h1 className="text-3xl font-bold tracking-tight text-cobalt sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">Effective date: {effectiveDate}</p>
        <div className="legal-prose mt-8 space-y-5 text-sm leading-relaxed text-gray-700 sm:text-[15px]">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-cobalt">{title}</h2>
      {children}
    </section>
  );
}
