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

function persist(): void {
  try {
    writeFileSync(resolveStorePath(), JSON.stringify(store, null, 2));
  } catch (error) {
    logger.warn("Subscription store persist failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function findSubscriptionByEmail(email: string): SubscriptionRecord | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  return store.byEmail[key] ?? null;
}

export function findSubscriptionByCustomerId(customerId: string): SubscriptionRecord | null {
  const id = customerId.trim();
  if (!id) return null;
  return Object.values(store.byEmail).find((row) => row.stripeCustomerId === id) ?? null;
}

export function findSubscriptionBySubscriptionId(subscriptionId: string): SubscriptionRecord | null {
  const id = subscriptionId.trim();
  if (!id) return null;
  return Object.values(store.byEmail).find((row) => row.stripeSubscriptionId === id) ?? null;
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

  // If we remapped to a new email key, drop a stale customer-id-only row.
  if (existing && existing.email !== key) {
    delete store.byEmail[existing.email];
  }

  store.byEmail[key] = record;
  persist();
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
  store.byEmail[existing.email] = record;
  persist();
  return record;
}

export function subscriptionStoreStats(): { total: number; active: number } {
  const rows = Object.values(store.byEmail);
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
  };
}
