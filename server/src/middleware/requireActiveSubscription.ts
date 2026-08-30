import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { clerkPrimaryEmail } from "../lib/clerkUserEmail";
import { isSubscriptionEntitled } from "../store/subscriptionStore";

/**
 * Require an active or trialing Stripe subscription.
 * Use after `clerkMiddleware()` and `requireClerkAuth`.
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (!auth.isAuthenticated || !auth.userId) {
    res.status(401).json({ error: "Unauthorized — sign in required" });
    return;
  }

  try {
    const email = await clerkPrimaryEmail(auth.userId);
    if (!email || !(await isSubscriptionEntitled(email))) {
      res.status(403).json({
        error: "Subscription required — start your trial to access live alerts",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
