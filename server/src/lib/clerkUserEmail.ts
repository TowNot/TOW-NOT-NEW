import { clerkClient } from "@clerk/express";

/** Primary email for a Clerk user — used for subscription lookups. */
export async function clerkPrimaryEmail(userId: string): Promise<string | null> {
  return (await clerkPrimaryEmailInfo(userId))?.email ?? null;
}

export async function clerkPrimaryEmailInfo(
  userId: string,
): Promise<{ email: string; verified: boolean } | null> {
  const user = await clerkClient.users.getUser(userId);
  const entry =
    user.emailAddresses.find((candidate) => candidate.id === user.primaryEmailAddressId) ??
    user.emailAddresses[0];
  const email = entry?.emailAddress?.trim().toLowerCase();
  if (!email) return null;
  return { email, verified: entry?.verification?.status === "verified" };
}
