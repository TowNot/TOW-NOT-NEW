const ACCOUNT_HOST = "https://accounts.alertnav.com";

export function welcomeRedirectUrl(): string {
  if (typeof window === "undefined") return "https://alertnav.com/welcome";
  return `${window.location.origin}/welcome`;
}

export function accountPortalUrl(path: "sign-in" | "sign-up"): string {
  const redirect = encodeURIComponent(welcomeRedirectUrl());
  return `${ACCOUNT_HOST}/${path}?redirect_url=${redirect}`;
}
