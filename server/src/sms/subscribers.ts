import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { toE164 } from "./e164";
import { invalidateActiveMonitoredCitiesCache } from "../engine/activeMonitoredCities";
import { isClerkUserEntitled } from "../store/subscriptionStore";
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
  selectedCity: string;
  clerkUserId: string | null;
}

/** Active subscribers — refreshed from Postgres on miss / after writes. */
let activeSubscribersCache: SmsSubscriberRow[] | null = null;

function rowFromDb(row: {
  phone: string;
  selectedCity: string;
  clerkUserId: string | null;
  alertAccidents: boolean;
  alertIncidents: boolean;
  alertPolice: boolean;
  alertFire: boolean;
  alertWaze: boolean;
  alertGoogleMaps: boolean;
}): SmsSubscriberRow {
  return {
    phone: row.phone,
    selectedCity: row.selectedCity,
    clerkUserId: row.clerkUserId,
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
      selectedCity: true,
      clerkUserId: true,
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

function assertClerkUserId(clerkUserId: string): string {
  const id = clerkUserId.trim();
  if (!id) throw new Error("Sign in required to manage SMS alerts");
  return id;
}

function assertOwnedBy(
  existing: { clerkUserId: string | null; active: boolean },
  clerkUserId: string,
): void {
  if (!existing.active) {
    throw new Error("That number is not opted in for SMS");
  }
  if (!existing.clerkUserId) {
    throw new Error("Re-verify this number in SMS settings to link it to your account");
  }
  if (existing.clerkUserId !== clerkUserId) {
    throw new Error("That number is linked to another AlertNav account");
  }
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

export async function listSmsRecipientsForCategory(
  category: PushCategory,
  zoneId?: string | null,
): Promise<string[]> {
  const city = zoneId?.trim().toLowerCase();
  if (!city) return [];

  const rows = await listSmsSubscriberRows();
  const candidates = rows.filter(
    (row) =>
      row.selectedCity.trim().toLowerCase() === city &&
      subscriberWantsSmsCategory(row, category),
  );

  // Drop numbers whose Clerk owner no longer has an active/trialing subscription.
  const entitlementByUser = new Map<string, boolean>();
  const phones: string[] = [];
  for (const row of candidates) {
    const ownerId = row.clerkUserId?.trim() || "";
    if (!ownerId) continue;
    let entitled = entitlementByUser.get(ownerId);
    if (entitled === undefined) {
      entitled = await isClerkUserEntitled(ownerId);
      entitlementByUser.set(ownerId, entitled);
    }
    if (entitled) phones.push(row.phone);
  }
  return phones;
}

/** Keep SMS city in sync when the signed-in user switches desk city. */
export async function updateSmsSubscriberCityForClerkUser(
  clerkUserIdRaw: string,
  selectedCity: string,
): Promise<void> {
  const clerkUserId = clerkUserIdRaw.trim();
  const city = selectedCity.trim().toLowerCase();
  if (!clerkUserId || !city) return;

  const result = await prisma.smsSubscriber.updateMany({
    where: { clerkUserId, active: true },
    data: { selectedCity: city },
  });
  if (result.count > 0) {
    invalidateSmsCache();
    invalidateActiveMonitoredCitiesCache();
  }
}

/** Turn off SMS for a Clerk user when their Stripe access ends. */
export async function deactivateSmsSubscribersForClerkUser(
  clerkUserIdRaw: string,
): Promise<number> {
  const clerkUserId = clerkUserIdRaw.trim();
  if (!clerkUserId) return 0;

  const result = await prisma.smsSubscriber.updateMany({
    where: { clerkUserId, active: true },
    data: { active: false },
  });
  if (result.count > 0) {
    invalidateSmsCache();
    invalidateActiveMonitoredCitiesCache();
    logger.info("Deactivated SMS subscribers after subscription revoke", {
      clerkUserId,
      count: result.count,
    });
  }
  return result.count;
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

/** One active SMS number per Clerk account. */
async function deactivateOtherPhonesForUser(clerkUserId: string, keepPhone: string): Promise<void> {
  await prisma.smsSubscriber.updateMany({
    where: {
      clerkUserId,
      active: true,
      NOT: { phone: keepPhone },
    },
    data: { active: false },
  });
}

export async function addSmsSubscriber(
  raw: string,
  selectedCity: string | null | undefined,
  alertPrefs: Partial<SmsAlertPreferences> | null | undefined,
  clerkUserIdRaw: string,
): Promise<{ phone: string; created: boolean }> {
  const clerkUserId = assertClerkUserId(clerkUserIdRaw);
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (existing?.active && existing.clerkUserId && existing.clerkUserId !== clerkUserId) {
    throw new Error("This number is already linked to another AlertNav account");
  }

  if (existing?.active && existing.clerkUserId === clerkUserId) {
    if (alertPrefs) {
      await updateSmsAlertPreferences(phone, alertPrefs, clerkUserId);
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
      clerkUserId,
      ...prefs,
    },
    update: {
      active: true,
      clerkUserId,
      ...(selectedCity?.trim() ? { selectedCity: city } : {}),
      ...prefs,
    },
  });

  await deactivateOtherPhonesForUser(clerkUserId, phone);

  invalidateSmsCache();
  invalidateActiveMonitoredCitiesCache();
  return { phone, created: !existing?.active };
}

export async function updateSmsAlertPreferences(
  rawPhone: string,
  alertPrefs: Partial<SmsAlertPreferences>,
  clerkUserIdRaw: string,
): Promise<{ phone: string; prefs: SmsAlertPreferences }> {
  const clerkUserId = assertClerkUserId(clerkUserIdRaw);
  const phone = toE164(rawPhone);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (!existing) {
    throw new Error("That number is not opted in for SMS");
  }
  assertOwnedBy(existing, clerkUserId);

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
  clerkUserIdRaw: string,
): Promise<{ phone: string; removed: boolean }> {
  const clerkUserId = assertClerkUserId(clerkUserIdRaw);
  const phone = toE164(raw);
  if (!phone) {
    throw new Error("Enter a valid phone number, e.g. 519-555-1212 or +15195551212");
  }

  const existing = await prisma.smsSubscriber.findUnique({ where: { phone } });
  if (!existing?.active) {
    return { phone, removed: false };
  }
  assertOwnedBy(existing, clerkUserId);

  await prisma.smsSubscriber.update({
    where: { phone },
    data: { active: false },
  });

  invalidateSmsCache();
  invalidateActiveMonitoredCitiesCache();
  return { phone, removed: true };
}
