import { LegalDocumentLayout } from "../components/LegalDocumentLayout";
import disclaimerHtml from "../legal/disclaimer.html?raw";

export function DisclaimerPage() {
  return (
    <LegalDocumentLayout hideTitle>
      <div
        className="termly-privacy overflow-x-auto"
        // Official Termly Disclaimer export for AlertNav Inc.
        dangerouslySetInnerHTML={{ __html: disclaimerHtml }}
      />
    </LegalDocumentLayout>
  );
}
