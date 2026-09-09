const ACCOUNT_HOST = "https://accounts.alertnav.com";

function originUrl(): string {
  if (typeof window === "undefined") return "https://alertnav.com";
  return window.location.origin;
}

/** After sign-in — desk (gates to city picker only if needed). */
export function welcomeRedirectUrl(): string {
  return `${originUrl()}/dashboard`;
}

/** After sign-up — subscribe and install the app. */
export function getStartedRedirectUrl(): string {
  return `${originUrl()}/get-started`;
}

export function accountPortalUrl(
  path: "sign-in" | "sign-up",
  redirectUrl?: string,
): string {
  const redirect = encodeURIComponent(
    redirectUrl ?? (path === "sign-up" ? getStartedRedirectUrl() : welcomeRedirectUrl()),
  );
  return `${ACCOUNT_HOST}/${path}?redirect_url=${redirect}`;
}
