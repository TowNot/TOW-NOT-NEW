import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { isClerkUserEntitled } from "../store/subscriptionStore";

/**
 * Require an active or trialing Stripe subscription.
 * canceled / inactive / missing → 403 (desk + live APIs locked).
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
    if (!(await isClerkUserEntitled(auth.userId))) {
      res.status(403).json({
        code: "subscription_required",
        error: "Subscription required — renew billing to access live alerts",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
