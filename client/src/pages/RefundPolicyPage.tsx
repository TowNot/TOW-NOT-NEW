import { LegalDocumentLayout, LegalSection } from "../components/LegalDocumentLayout";

export function RefundPolicyPage() {
  return (
    <LegalDocumentLayout title="Refund Policy">
      <p>
        This Refund Policy explains how AlertNav handles subscription payments and refund
        requests for paid plans processed through Stripe.
      </p>

      <LegalSection title="1. Billing">
        <p>
          Subscription fees are charged in advance for the billing period you select at
          checkout. Prices and plan features are shown at the time of purchase.
        </p>
      </LegalSection>

      <LegalSection title="2. Cancellation">
        <p>
          You may cancel a recurring subscription to stop future renewals. Cancellation
          typically takes effect at the end of the current paid period unless otherwise stated
          at checkout or in your billing portal.
        </p>
      </LegalSection>

      <LegalSection title="3. Refund eligibility">
        <p>
          Unless required by applicable law, subscription fees are generally non-refundable
          once the billing period has started. We may, at our discretion, issue a full or
          partial refund for duplicate charges, confirmed billing errors, or unresolved
          service outages that prevent core paid features from working.
        </p>
      </LegalSection>

      <LegalSection title="4. How to request a refund">
        <p>
          Contact AlertNav support with your account email, approximate purchase date, and a
          short description of the issue. We may need to verify the Stripe payment receipt
          before processing any refund.
        </p>
      </LegalSection>

      <LegalSection title="5. Chargebacks">
        <p>
          Please contact us before filing a payment dispute so we can help resolve the issue.
          Unresolved chargebacks may result in account suspension.
        </p>
      </LegalSection>

      <p className="rounded-md border border-line bg-ink/60 px-4 py-3 text-xs text-gray-500">
        Placeholder notice: refund timelines and exceptions may be updated to match final
        Stripe product configuration and local consumer rules.
      </p>
    </LegalDocumentLayout>
  );
}
