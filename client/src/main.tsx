import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { resolveClerkPublishableKey } from "./lib/clerkKey";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const publishableKey = resolveClerkPublishableKey();

if (!publishableKey) {
  console.warn(
    "[AlertNav] Clerk publishable key missing — rendering without auth. Set VITE_CLERK_PUBLISHABLE_KEY (build) or CLERK_PUBLISHABLE_KEY (server runtime inject).",
  );
}

createRoot(root).render(
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/welcome"
      signUpFallbackRedirectUrl="/get-started"
    >
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
