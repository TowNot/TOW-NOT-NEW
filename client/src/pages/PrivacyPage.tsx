import { LegalDocumentLayout } from "../components/LegalDocumentLayout";
import privacyPolicyHtml from "../legal/privacy-policy.html?raw";

export function PrivacyPage() {
  return (
    <LegalDocumentLayout hideTitle>
      <div
        className="termly-privacy overflow-x-auto"
        // Official Termly Privacy Notice export for AlertNav Inc.
        dangerouslySetInnerHTML={{ __html: privacyPolicyHtml }}
      />
    </LegalDocumentLayout>
  );
}
