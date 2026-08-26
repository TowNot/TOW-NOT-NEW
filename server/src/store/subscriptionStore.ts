import type { Subscription, SubscriptionStatus as PrismaSubscriptionStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { invalidateActiveMonitoredCitiesCache } from "../engine/activeMonitoredCities";
import { logger } from "../logger";

export type SubscriptionStatus = "active" | "canceled" | "inactive";

export interface SubscriptionRecord {
  /** Normalized lowercase email — primary match key for Payment Link checkouts. */
  email: string;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** Optional app user id if Payment Link sets client_reference_id. */
  clientReferenceId: string | null;
  updatedAt: string;
  createdAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toRecord(row: Subscription): SubscriptionRecord {
  return {
    email: row.email,
    status: row.status,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    clientReferenceId: row.clientReferenceId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Hot-path read cache — invalidated on every write. */
const emailCache = new Map<string, SubscriptionRecord>();

function cacheRecord(record: SubscriptionRecord): void {
  emailCache.set(record.email, record);
}

function invalidateEmail(email: string): void {
  emailCache.delete(normalizeEmail(email));
}

export async function findSubscriptionByEmail(email: string): Promise<SubscriptionRecord | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  const cached = emailCache.get(key);
  if (cached) return cached;
  const row = await prisma.subscription.findUnique({ where: { email: key } });
  if (!row) return null;
  const record = toRecord(row);
  cacheRecord(record);
  return record;
}

export async function findSubscriptionByCustomerId(
  customerId: string,
): Promise<SubscriptionRecord | null> {
  const id = customerId.trim();
  if (!id) return null;
  const row = await prisma.subscription.findUnique({ where: { stripeCustomerId: id } });
  return row ? toRecord(row) : null;
}

export async function findSubscriptionBySubscriptionId(
  subscriptionId: string,
): Promise<SubscriptionRecord | null> {
  const id = subscriptionId.trim();
  if (!id) return null;
  const row = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: id } });
  return row ? toRecord(row) : null;
}

export async function findSubscriptionByClientReferenceId(
  clientReferenceId: string,
): Promise<SubscriptionRecord | null> {
  const id = clientReferenceId.trim();
  if (!id) return null;
  const row = await prisma.subscription.findFirst({ where: { clientReferenceId: id } });
  return row ? toRecord(row) : null;
}

export async function isSubscriptionActive(email: string): Promise<boolean> {
  return (await findSubscriptionByEmail(email))?.status === "active";
}

export async function listSubscriptions(): Promise<SubscriptionRecord[]> {
  const rows = await prisma.subscription.findMany({ orderBy: { email: "asc" } });
  return rows.map(toRecord);
}

/**
 * Activate (or create) a subscriber after checkout.session.completed.
 * Match order: email (required for Payment Links) → existing customer id row.
 */
export async function activateSubscription(input: {
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  clientReferenceId?: string | null;
}): Promise<SubscriptionRecord> {
  const emailRaw = input.email?.trim() ?? "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  const customerId = input.stripeCustomerId?.trim() || null;
  const subscriptionId = input.stripeSubscriptionId?.trim() || null;
  const clientReferenceId = input.clientReferenceId?.trim() || null;

  let existing: SubscriptionRecord | null = null;
  if (email) existing = await findSubscriptionByEmail(email);
  if (!existing && customerId) existing = await findSubscriptionByCustomerId(customerId);
  if (!existing && subscriptionId) {
    existing = await findSubscriptionBySubscriptionId(subscriptionId);
  }
  if (!existing && clientReferenceId) {
    existing = await findSubscriptionByClientReferenceId(clientReferenceId);
  }

  if (!email && !existing) {
    throw new Error(
      "checkout.session.completed has no customer email — enable email collection on the Payment Link",
    );
  }

  const key = email || existing!.email;
  if (existing && existing.email !== key) {
    invalidateEmail(existing.email);
    await prisma.subscription.delete({ where: { email: existing.email } }).catch(() => undefined);
  }

  const row = await prisma.subscription.upsert({
    where: { email: key },
    create: {
      email: key,
      status: "active" satisfies PrismaSubscriptionStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      clientReferenceId,
    },
    update: {
      status: "active",
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscriptionId ?? undefined,
      clientReferenceId: clientReferenceId ?? undefined,
    },
  });

  const record = toRecord(row);
  cacheRecord(record);
  invalidateActiveMonitoredCitiesCache();
  return record;
}

/**
 * Downgrade on customer.subscription.deleted (or equivalent revoke).
 * Resolves by subscription id, then customer id, then email.
 */
export async function revokeSubscription(input: {
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}): Promise<SubscriptionRecord | null> {
  const email = input.email?.trim() ? normalizeEmail(input.email) : "";
  const customerId = input.stripeCustomerId?.trim() || null;
  const subscriptionId = input.stripeSubscriptionId?.trim() || null;

  let existing: SubscriptionRecord | null = null;
  if (subscriptionId) existing = await findSubscriptionBySubscriptionId(subscriptionId);
  if (!existing && customerId) existing = await findSubscriptionByCustomerId(customerId);
  if (!existing && email) existing = await findSubscriptionByEmail(email);
  if (!existing) return null;

  const row = await prisma.subscription.update({
    where: { email: existing.email },
    data: {
      status: "canceled",
      stripeSubscriptionId: subscriptionId ?? existing.stripeSubscriptionId ?? undefined,
      stripeCustomerId: customerId ?? existing.stripeCustomerId ?? undefined,
    },
  });

  const record = toRecord(row);
  cacheRecord(record);
  invalidateActiveMonitoredCitiesCache();
  return record;
}

export async function subscriptionStoreStats(): Promise<{ total: number; active: number }> {
  const [total, active] = await Promise.all([
    prisma.subscription.count(),
    prisma.subscription.count({ where: { status: "active" } }),
  ]);
  return { total, active };
}

/** Warm subscription email cache at startup (optional). */
export async function warmSubscriptionCache(): Promise<void> {
  try {
    const rows = await prisma.subscription.findMany();
    for (const row of rows) {
      cacheRecord(toRecord(row));
    }
    logger.info("Subscription cache warmed", { count: rows.length });
  } catch (error) {
    logger.warn("Subscription cache warm skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
