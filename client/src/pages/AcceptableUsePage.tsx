import { LegalDocumentLayout } from "../components/LegalDocumentLayout";
import acceptableUseHtml from "../legal/acceptable-use.html?raw";

export function AcceptableUsePage() {
  return (
    <LegalDocumentLayout hideTitle>
      <div
        className="termly-privacy overflow-x-auto"
        // Official Termly Acceptable Use Policy export for AlertNav Inc.
        dangerouslySetInnerHTML={{ __html: acceptableUseHtml }}
      />
    </LegalDocumentLayout>
  );
}
