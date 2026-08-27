import { LegalDocumentLayout, LegalSection } from "../components/LegalDocumentLayout";

export function TermsPage() {
  return (
    <LegalDocumentLayout title="Terms & Conditions">
      <p>
        These Terms & Conditions (“Terms”) govern your access to and use of AlertNav. By using
        the Service, you agree to these Terms. If you do not agree, do not use AlertNav.
      </p>

      <LegalSection title="1. The Service">
        <p>
          AlertNav provides real-time monitoring and notifications related to traffic incidents
          and related signals. Coverage, latency, and source availability vary by city and may
          change without notice.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts and subscriptions">
        <p>
          You are responsible for maintaining the security of your account credentials. Paid
          features are billed through our payment provider under the plan you select. Failed
          payments may result in suspension of paid features.
        </p>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>
          You agree not to misuse the Service, attempt unauthorized access, interfere with
          other users, scrape beyond normal product use, or use AlertNav for unlawful
          activities. Emergency response decisions must never rely solely on AlertNav.
        </p>
      </LegalSection>

      <LegalSection title="4. Intellectual property">
        <p>
          AlertNav branding, software, and original interface content are owned by us or our
          licensors. Third-party map, traffic, and dispatch data remain subject to those
          providers’ terms.
        </p>
      </LegalSection>

      <LegalSection title="5. Disclaimer of warranties">
        <p>
          The Service is provided “as is” and “as available.” We do not warrant uninterrupted
          operation, complete accuracy of third-party incident data, or fitness for a
          particular purpose. See also our{" "}
          <a href="/disclaimer" className="font-medium text-cobalt underline">
            Disclaimer
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Limitation of liability">
        <p>
          To the fullest extent permitted by law, AlertNav is not liable for indirect,
          incidental, special, consequential, or punitive damages, or for losses arising from
          reliance on incident alerts, map routing, or third-party data.
        </p>
      </LegalSection>

      <LegalSection title="7. Termination">
        <p>
          We may suspend or terminate access for violations of these Terms or to protect the
          Service. You may stop using AlertNav at any time. Refund eligibility is described in
          our{" "}
          <a href="/refund-policy" className="font-medium text-cobalt underline">
            Refund Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="8. Changes">
        <p>
          We may update these Terms periodically. Continued use after changes are posted means
          you accept the updated Terms.
        </p>
      </LegalSection>

      <p className="rounded-md border border-line bg-ink/60 px-4 py-3 text-xs text-gray-500">
        Placeholder notice: this page is an initial Terms draft for AlertNav and may be
        refined by counsel before broader commercial launch.
      </p>
    </LegalDocumentLayout>
  );
}
