import { apiFetch } from "./apiFetch";
import {
  readDeskFilterPreferences,
  type DeskFilterPreferences,
} from "./deskFilterPreferences";
import { readPoliceAlertsEnabled } from "./policeAlerts";

const SMS_PHONE_STORAGE_KEY = "alertnav-sms-phone";

export interface SmsAlertPreferencesPayload {
  alertAccidents: boolean;
  alertIncidents: boolean;
  alertPolice: boolean;
  alertFire: boolean;
  alertWaze: boolean;
  alertGoogleMaps: boolean;
}

/** Map Live Desk toggles → SMS category prefs (same rules as Progressier tags). */
export function smsAlertPreferencesFromDesk(
  desk: DeskFilterPreferences = readDeskFilterPreferences(),
  policeAlertsEnabled: boolean = readPoliceAlertsEnabled(),
): SmsAlertPreferencesPayload {
  return {
    alertAccidents: desk.showAccidents,
    alertIncidents: desk.showIncidents,
    alertPolice: policeAlertsEnabled,
    alertFire: desk.fire_dispatch,
    alertWaze: desk.waze,
    alertGoogleMaps: desk.google_maps,
  };
}

export function readStoredSmsPhone(): string | null {
  try {
    return window.localStorage.getItem(SMS_PHONE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Push current desk/police toggles to the server for the opted-in SMS number. */
export async function syncSmsAlertPreferences(phone?: string | null): Promise<void> {
  const target = (phone ?? readStoredSmsPhone())?.trim();
  if (!target) return;

  try {
    const response = await apiFetch("/api/sms/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: target,
        alertPreferences: smsAlertPreferencesFromDesk(),
      }),
    });
    if (!response.ok && response.status !== 400) {
      // 400 = not opted in yet — ignore quietly.
      return;
    }
  } catch {
    // Offline / private mode — Progressier tags still apply for push.
  }
}
