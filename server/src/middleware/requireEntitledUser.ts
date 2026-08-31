import type { RequestHandler } from "express";
import { requireActiveSubscription } from "./requireActiveSubscription";
import { requireClerkAuth } from "./requireClerkAuth";

/** Sign-in plus active/trialing Stripe subscription — use on all paid-product APIs. */
export const requireEntitledUser: RequestHandler[] = [
  requireClerkAuth,
  requireActiveSubscription,
];
