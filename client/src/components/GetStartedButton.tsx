import { accountPortalUrl } from "../lib/clerkPortal";
import { isClerkConfigured } from "../lib/clerkKey";

interface GetStartedButtonProps {
  className?: string;
  label?: string;
}

export function GetStartedButton({
  className = "btn-secondary btn-cta-pair text-sm",
  label = "Get started",
}: GetStartedButtonProps) {
  if (!isClerkConfigured()) {
    return (
      <a href="/get-started" className={`${className} no-underline`}>
        {label}
      </a>
    );
  }

  return (
    <a href={accountPortalUrl("sign-up")} className={`${className} no-underline`}>
      {label}
    </a>
  );
}
