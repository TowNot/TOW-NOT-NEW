import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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

interface SubscriptionStoreFile {
  byEmail: Record<string, SubscriptionRecord>;
}

function resolveStorePath(): string {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "subscriptions.json");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function load(): SubscriptionStoreFile {
  const file = resolveStorePath();
  if (!existsSync(file)) return { byEmail: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SubscriptionStoreFile>;
    return { byEmail: parsed.byEmail && typeof parsed.byEmail === "object" ? parsed.byEmail : {} };
  } catch (error) {
    logger.warn("Subscription store unreadable — starting empty", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { byEmail: {} };
  }
}

let store = load();

/**
 * Secondary indexes (email → already O(1) via `byEmail`).
 * Maps foreign keys → email so Stripe webhook lookups stay O(1) as we scale.
 */
const byStripeCustomerId = new Map<string, string>();
const byStripeSubscriptionId = new Map<string, string>();
const byClientReferenceId = new Map<string, string>();

function clearSecondaryIndexes(): void {
  byStripeCustomerId.clear();
  byStripeSubscriptionId.clear();
  byClientReferenceId.clear();
}

function unindexRecord(row: SubscriptionRecord): void {
  if (row.stripeCustomerId && byStripeCustomerId.get(row.stripeCustomerId) === row.email) {
    byStripeCustomerId.delete(row.stripeCustomerId);
  }
  if (
    row.stripeSubscriptionId &&
    byStripeSubscriptionId.get(row.stripeSubscriptionId) === row.email
  ) {
    byStripeSubscriptionId.delete(row.stripeSubscriptionId);
  }
  if (
    row.clientReferenceId &&
    byClientReferenceId.get(row.clientReferenceId) === row.email
  ) {
    byClientReferenceId.delete(row.clientReferenceId);
  }
}

function indexRecord(row: SubscriptionRecord): void {
  if (row.stripeCustomerId) byStripeCustomerId.set(row.stripeCustomerId, row.email);
  if (row.stripeSubscriptionId) {
    byStripeSubscriptionId.set(row.stripeSubscriptionId, row.email);
  }
  if (row.clientReferenceId) byClientReferenceId.set(row.clientReferenceId, row.email);
}

function rebuildSecondaryIndexes(): void {
  clearSecondaryIndexes();
  for (const row of Object.values(store.byEmail)) {
    indexRecord(row);
  }
}

rebuildSecondaryIndexes();

function persist(): void {
  try {
    writeFileSync(resolveStorePath(), JSON.stringify(store, null, 2));
  } catch (error) {
    logger.warn("Subscription store persist failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function putRecord(record: SubscriptionRecord, previous?: SubscriptionRecord | null): void {
  if (previous) {
    unindexRecord(previous);
    if (previous.email !== record.email) {
      delete store.byEmail[previous.email];
    }
  }
  store.byEmail[record.email] = record;
  indexRecord(record);
  persist();
}

export function findSubscriptionByEmail(email: string): SubscriptionRecord | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  return store.byEmail[key] ?? null;
}

export function findSubscriptionByCustomerId(customerId: string): SubscriptionRecord | null {
  const id = customerId.trim();
  if (!id) return null;
  const email = byStripeCustomerId.get(id);
  return email ? (store.byEmail[email] ?? null) : null;
}

export function findSubscriptionBySubscriptionId(subscriptionId: string): SubscriptionRecord | null {
  const id = subscriptionId.trim();
  if (!id) return null;
  const email = byStripeSubscriptionId.get(id);
  return email ? (store.byEmail[email] ?? null) : null;
}

export function findSubscriptionByClientReferenceId(
  clientReferenceId: string,
): SubscriptionRecord | null {
  const id = clientReferenceId.trim();
  if (!id) return null;
  const email = byClientReferenceId.get(id);
  return email ? (store.byEmail[email] ?? null) : null;
}

export function isSubscriptionActive(email: string): boolean {
  return findSubscriptionByEmail(email)?.status === "active";
}

export function listSubscriptions(): SubscriptionRecord[] {
  return Object.values(store.byEmail).sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Activate (or create) a subscriber after checkout.session.completed.
 * Match order: email (required for Payment Links) → existing customer id row.
 */
export function activateSubscription(input: {
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  clientReferenceId?: string | null;
}): SubscriptionRecord {
  const emailRaw = input.email?.trim() ?? "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  const customerId = input.stripeCustomerId?.trim() || null;
  const subscriptionId = input.stripeSubscriptionId?.trim() || null;
  const clientReferenceId = input.clientReferenceId?.trim() || null;
  const now = new Date().toISOString();

  let existing: SubscriptionRecord | null = null;
  if (email) existing = findSubscriptionByEmail(email);
  if (!existing && customerId) existing = findSubscriptionByCustomerId(customerId);
  if (!existing && subscriptionId) existing = findSubscriptionBySubscriptionId(subscriptionId);
  if (!existing && clientReferenceId) {
    existing = findSubscriptionByClientReferenceId(clientReferenceId);
  }

  if (!email && !existing) {
    throw new Error(
      "checkout.session.completed has no customer email — enable email collection on the Payment Link",
    );
  }

  const key = email || existing!.email;
  const record: SubscriptionRecord = {
    email: key,
    status: "active",
    stripeCustomerId: customerId ?? existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: subscriptionId ?? existing?.stripeSubscriptionId ?? null,
    clientReferenceId: clientReferenceId ?? existing?.clientReferenceId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  putRecord(record, existing);
  return record;
}

/**
 * Downgrade on customer.subscription.deleted (or equivalent revoke).
 * Resolves by subscription id, then customer id, then email.
 */
export function revokeSubscription(input: {
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}): SubscriptionRecord | null {
  const email = input.email?.trim() ? normalizeEmail(input.email) : "";
  const customerId = input.stripeCustomerId?.trim() || null;
  const subscriptionId = input.stripeSubscriptionId?.trim() || null;

  let existing: SubscriptionRecord | null = null;
  if (subscriptionId) existing = findSubscriptionBySubscriptionId(subscriptionId);
  if (!existing && customerId) existing = findSubscriptionByCustomerId(customerId);
  if (!existing && email) existing = findSubscriptionByEmail(email);
  if (!existing) return null;

  const now = new Date().toISOString();
  const record: SubscriptionRecord = {
    ...existing,
    status: "canceled",
    stripeSubscriptionId: subscriptionId ?? existing.stripeSubscriptionId,
    stripeCustomerId: customerId ?? existing.stripeCustomerId,
    updatedAt: now,
  };
  putRecord(record, existing);
  return record;
}

export function subscriptionStoreStats(): { total: number; active: number } {
  const rows = Object.values(store.byEmail);
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
  };
}
