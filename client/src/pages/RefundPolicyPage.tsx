import { LegalDocumentLayout } from "../components/LegalDocumentLayout";
import returnPolicyHtml from "../legal/return-policy.html?raw";

export function RefundPolicyPage() {
  return (
    <LegalDocumentLayout hideTitle>
      <div
        className="termly-privacy overflow-x-auto"
        // Official Termly Return Policy export for AlertNav Inc.
        dangerouslySetInnerHTML={{ __html: returnPolicyHtml }}
      />
    </LegalDocumentLayout>
  );
}
