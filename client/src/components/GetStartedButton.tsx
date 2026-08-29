import { SignUpButton } from "@clerk/clerk-react";
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
    <SignUpButton mode="modal" forceRedirectUrl="/get-started">
      <button type="button" className={className}>
        {label}
      </button>
    </SignUpButton>
  );
}
