import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { toE164 } from "./e164";
import { invalidateActiveMonitoredCitiesCache } from "../engine/activeMonitoredCities";
import type { PushCategory } from "../engine/pushCategories";

const MAX_SUBSCRIBERS = 50;

/** Category toggles for SMS — aligned with Progressier / desk filters. */
export interface SmsAlertPreferences {
  alertAccidents: boolean;
  alertIncidents: boolean;
  alertPolice: boolean;
  alertFire: boolean;
  alertWaze: boolean;
  alertGoogleMaps: boolean;
}

export const DEFAULT_SMS_ALERT_PREFERENCES: SmsAlertPreferences = {
  alertAccidents: true,
  alertIncidents: false,
  alertPolice: false,
  alertFire: true,
  alertWaze: true,
  alertGoogleMaps: true,
};

export interface SmsSubscriberRow extends SmsAlertPreferences {
  phone: string;
}

/** Active subscribers — refreshed from Postgres on miss / after writes. */
let activeSubscribersCache: SmsSubscriberRow[] | null = null;

function rowFromDb(row: {
  phone: string;
  alertAccidents: boolean;
  alertIncidents: boolean;
  alertPolice: boolean;
  alertFire: boolean;
  alertWaze: boolean;
  alertGoogleMaps: boolean;
}): SmsSubscriberRow {
  return {
    phone: row.phone,
    alertAccidents: row.alertAccidents,
    alertIncidents: row.alertIncidents,
    alertPolice: row.alertPolice,
    alertFire: row.alertFire,
    alertWaze: row.alertWaze,
    alertGoogleMaps: row.alertGoogleMaps,
  };
}

async function refreshActiveSubscribersCache(): Promise<SmsSubscriberRow[]> {
  const rows = await prisma.smsSubscriber.findMany({
    where: { active: true },
    select: {
      phone: true,
      alertAccidents: true,
      alertIncidents: true,
      alertPolice: true,
      alertFire: true,
      alertWaze: true,
      alertGoogleMaps: true,
    },
    orderBy: { phone: "asc" },
  });
  activeSubscribersCache = rows.map(rowFromDb);
  return activeSubscribersCache;
}

function invalidateSmsCache(): void {
  activeSubscribersCache = null;
}

export async function warmSmsSubscriberCache(): Promise<void> {
  try {
    const count = (await refreshActiveSubscribersCache()).length;
    logger.info("SMS subscriber cache warmed", { count });
  } catch (error) {
    logger.warn("SMS subscriber cache warm skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listSmsSubscribers(): Promise<string[]> {
  const rows = activeSubscribersCache ?? (await refreshActiveSubscribersCache());
  return rows.map((row) => row.phone);
}

export async function listSmsSubscriberRows(): Promise<SmsSubscriberRow[]> {
  if (activeSubscribersCache) return activeSubscribersCache.map((row) => ({ ...row }));
  return (await refreshActiveSubscribersCache()).map((row) => ({ ...row }));
}

/** Whether this subscriber should receive SMS for a Progressier push category. */
export function subscriberWantsSmsCategory(
  prefs: SmsAlertPreferences,
  category: PushCategory,
): boolean {
  switch (category) {
    case "waze_police":
      return prefs.alertPolice;
    case "waze":
      return prefs.alertWaze && prefs.alertAccidents;
    case "google_maps_accidents":
      return prefs.alertGoogleMaps && prefs.alertAccidents;
    case "google_maps_incidents":
      return prefs.alertGoogleMaps && prefs.alertIncidents;
    case "fire":
      return prefs.alertFire;
    default:
      return false;
  }
}

export async function listSmsRecipientsForCategory(category: PushCategory): Promise<string[]> {
  const rows = await listSmsSubscriberRows();
  return rows
    .filter((row) => subscriberWantsSmsCategory(row, category))
    .map((row) => row.phone);
}

export async function smsSubscriberCount(): Promise<number> {
  if (activeSubscribersCache) return activeSubscribersCache.length;
  return prisma.smsSubscriber.count({ where: { active: true } });
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function normalizeSmsAlertPreferences(
  raw: Partial<SmsAlertPreferences> | null | undefined,
): SmsAlertPreferences {
  return {
    alertAccidents: parseBool(raw?.alertAccidents, DEFAULT_SMS_ALERT_PREFERENCES.alertAccidents),
    alertIncidents: parseBool(raw?.alertIncidents, DEFAULT_SMS_ALERT_PREFERENCES.alertIncidents),
    alertPolice: parseBool(raw?.alertPolice, DEFAULT_SMS_ALERT_PREFERENCES.alertPolice),
    alertFire: parseBool(raw?.alertFire, DEFAULT_SMS_ALERT_PREFERENCES.alertFire),
    alertWaze: parseBool(raw?.alertWaze, DEFAULT_SMS_ALERT_PREFERENCES.alertWaze),
    alertGoogleMaps: parseBool(raw?.alertGoogleMaps, DEFAULT_SMS_ALERT_PREFERENCES.alertGoogleMaps),
  };
}

export async function addSmsSubscriber(
  raw: string,
  selectedCity?: string | null,
  alertPrefs?: Partial<SmsAlertPreferences> | null,
): Promise<{ phone: string; created: boolean }> {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (existing?.active) {
    if (alertPrefs) {
      await updateSmsAlertPreferences(phone, alertPrefs);
    }
    return { phone, created: false };
  }

  const activeCount = await prisma.smsSubscriber.count({ where: { active: true } });
  if (!existing && activeCount >= MAX_SUBSCRIBERS) {
    throw new Error("SMS opt-in list is full");
  }

  const city = selectedCity?.trim().toLowerCase() || "london";
  const prefs = normalizeSmsAlertPreferences(alertPrefs);

  await prisma.smsSubscriber.upsert({
    where: { phone },
    create: {
      phone,
      active: true,
      selectedCity: city,
      ...prefs,
    },
    update: {
      active: true,
      ...(selectedCity?.trim() ? { selectedCity: city } : {}),
      ...prefs,
    },
  });

  invalidateSmsCache();
  invalidateActiveMonitoredCitiesCache();
  return { phone, created: !existing?.active };
}

export async function updateSmsAlertPreferences(
  rawPhone: string,
  alertPrefs: Partial<SmsAlertPreferences>,
): Promise<{ phone: string; prefs: SmsAlertPreferences }> {
  const phone = toE164(rawPhone);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (!existing?.active) {
    throw new Error("That number is not opted in for SMS");
  }

  const prefs = normalizeSmsAlertPreferences({
    alertAccidents: alertPrefs.alertAccidents ?? existing.alertAccidents,
    alertIncidents: alertPrefs.alertIncidents ?? existing.alertIncidents,
    alertPolice: alertPrefs.alertPolice ?? existing.alertPolice,
    alertFire: alertPrefs.alertFire ?? existing.alertFire,
    alertWaze: alertPrefs.alertWaze ?? existing.alertWaze,
    alertGoogleMaps: alertPrefs.alertGoogleMaps ?? existing.alertGoogleMaps,
  });

  await prisma.smsSubscriber.update({
    where: { phone },
    data: prefs,
  });

  invalidateSmsCache();
  return { phone, prefs };
}

export async function removeSmsSubscriber(
  raw: string,
): Promise<{ phone: string; removed: boolean }> {
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (!existing?.active) {
    return { phone, removed: false };
  }

  await prisma.smsSubscriber.update({
    where: { phone },
    data: { active: false },
  });

  invalidateSmsCache();
  invalidateActiveMonitoredCitiesCache();
  return { phone, removed: true };
}
