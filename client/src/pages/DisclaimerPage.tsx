import { LegalDocumentLayout, LegalSection } from "../components/LegalDocumentLayout";

export function DisclaimerPage() {
  return (
    <LegalDocumentLayout title="Disclaimer">
      <p>
        Please read this Disclaimer carefully before relying on AlertNav for any operational,
        driving, or emergency decision.
      </p>

      <LegalSection title="1. Not an official emergency service">
        <p>
          AlertNav is a third-party monitoring tool. It is not affiliated with, endorsed by, or
          a substitute for police, fire, EMS, municipal traffic control, or official 9-1-1 /
          emergency communications.
        </p>
      </LegalSection>

      <LegalSection title="2. Third-party data">
        <p>
          Incident pins, closures, construction markers, and dispatch-derived alerts may be
          delayed, incomplete, duplicated, misplaced, or incorrect. Sources can change or
          become unavailable without notice.
        </p>
      </LegalSection>

      <LegalSection title="3. No guarantee of alerts">
        <p>
          Push notifications, SMS, and desk updates may fail due to device settings, network
          conditions, browser permissions, carrier delivery, or upstream source gaps. Do not
          assume silence means roads are clear.
        </p>
      </LegalSection>

      <LegalSection title="4. Safe use">
        <p>
          Always obey traffic laws, posted signs, and official instructions. Do not interact
          with AlertNav while driving. Navigation apps opened from AlertNav are operated by
          their own providers under their own terms.
        </p>
      </LegalSection>

      <LegalSection title="5. Limitation">
        <p>
          To the maximum extent permitted by law, AlertNav and its operators disclaim liability
          for injury, property damage, lost profits, or other losses arising from use of or
          reliance on the Service. Additional terms appear in our{" "}
          <a href="/terms" className="font-medium text-cobalt underline">
            Terms & Conditions
          </a>
          .
        </p>
      </LegalSection>

      <p className="rounded-md border border-line bg-ink/60 px-4 py-3 text-xs text-gray-500">
        Placeholder notice: this Disclaimer is an initial draft and may be expanded for
        jurisdiction-specific requirements.
      </p>
    </LegalDocumentLayout>
  );
}
