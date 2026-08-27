import { LegalDocumentLayout, LegalSection } from "../components/LegalDocumentLayout";

export function PrivacyPage() {
  return (
    <LegalDocumentLayout title="Privacy Policy">
      <p>
        AlertNav (“we”, “us”, or “our”) operates the AlertNav website and application (the
        “Service”). This Privacy Policy explains how we collect, use, disclose, and protect
        information when you use the Service.
      </p>

      <LegalSection title="1. Information we collect">
        <p>We may collect the following categories of information:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account information</strong> — such as your name, email address, and
            authentication identifiers when you sign up or sign in (including via our auth
            provider, Clerk).
          </li>
          <li>
            <strong>Billing information</strong> — payment and subscription details processed by
            our payment provider (Stripe). We do not store full payment card numbers on our
            servers.
          </li>
          <li>
            <strong>Service preferences</strong> — such as your selected monitoring city/zone,
            SMS subscription settings, and optional police-alert preferences.
          </li>
          <li>
            <strong>Device and notification data</strong> — push subscription endpoints and
            related device tags needed to deliver alerts.
          </li>
          <li>
            <strong>Usage and technical data</strong> — IP address, browser type, pages viewed,
            and approximate timestamps used for security, reliability, and product improvement.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How we use information">
        <p>We use collected information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide, operate, and improve real-time incident monitoring and alerts</li>
          <li>Authenticate users and manage subscriptions</li>
          <li>Send push notifications, SMS (when enabled), and service-related messages</li>
          <li>Process payments and prevent fraud or abuse</li>
          <li>Comply with legal obligations and enforce our terms</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Incident data and third-party sources">
        <p>
          AlertNav aggregates publicly available or third-party traffic and dispatch signals
          (for example Waze-related feeds, Google Maps traffic alert providers, and radio /
          CAD sources where enabled). Incident content shown in the Service originates from
          those sources and may include approximate locations, timestamps, and reporter
          usernames when supplied by the source.
        </p>
        <p>
          We do not sell personal information. We may share limited data with processors that
          help us run the Service (hosting, authentication, payments, SMS, and push delivery)
          under contractual obligations to protect it.
        </p>
      </LegalSection>

      <LegalSection title="4. Cookies and similar technologies">
        <p>
          We and our providers may use cookies or local storage for authentication sessions,
          preference persistence (such as selected zone), and basic analytics needed to keep
          the Service secure and functional.
        </p>
      </LegalSection>

      <LegalSection title="5. Data retention">
        <p>
          We retain account and subscription records for as long as your account is active and
          as needed for billing, support, and legal compliance. Live incident cards are
          ephemeral operational data and are pruned according to our service retention windows.
        </p>
      </LegalSection>

      <LegalSection title="6. Your choices">
        <ul className="list-disc space-y-2 pl-5">
          <li>Update or delete account information through available account controls</li>
          <li>Disable browser/device push permissions at any time</li>
          <li>Opt out of optional SMS or police alert features where offered</li>
          <li>Contact us to request access, correction, or deletion where applicable by law</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Security">
        <p>
          We use industry-standard safeguards appropriate to the nature of the data we handle.
          No method of transmission or storage is 100% secure; please use a strong password and
          keep your credentials confidential.
        </p>
      </LegalSection>

      <LegalSection title="8. Children’s privacy">
        <p>
          The Service is not directed to children under 13 (or the minimum age required in your
          jurisdiction). We do not knowingly collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. The “Effective date” at the top
          of this page will be revised when changes are posted. Continued use of the Service
          after updates constitutes acceptance of the revised policy.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about this Privacy Policy or your data may be sent to the AlertNav support
          contact published on our website or within the app.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
