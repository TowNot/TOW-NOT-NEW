/** Client routes that require sign-in + active/trialing subscription. */
export const PROTECTED_DESK_PATHS = ["/dashboard", "/desk", "/feed"] as const;

export function isProtectedDeskPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  return PROTECTED_DESK_PATHS.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/** Post-login flows that require auth; subscription checked inside the gate component. */
export const PROTECTED_ONBOARDING_PATHS = ["/welcome", "/select-zone"] as const;

export function isProtectedOnboardingPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  return (PROTECTED_ONBOARDING_PATHS as readonly string[]).includes(normalized);
}
