import { clerkClient } from "@clerk/express";

/** Primary email for a Clerk user — used for subscription lookups. */
export async function clerkPrimaryEmail(userId: string): Promise<string | null> {
  const user = await clerkClient.users.getUser(userId);
  const primary =
    user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress;
  return primary?.trim().toLowerCase() || null;
}
