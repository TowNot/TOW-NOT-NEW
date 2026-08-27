import { LegalDocumentLayout } from "../components/LegalDocumentLayout";
import termsOfServiceHtml from "../legal/terms-of-service.html?raw";

export function TermsPage() {
  return (
    <LegalDocumentLayout hideTitle>
      <div
        className="termly-privacy overflow-x-auto"
        // Official Termly Terms of Service export for AlertNav Inc.
        dangerouslySetInnerHTML={{ __html: termsOfServiceHtml }}
      />
    </LegalDocumentLayout>
  );
}
