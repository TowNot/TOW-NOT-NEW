import type { RequestHandler } from "express";
import { requireActiveSubscription } from "./requireActiveSubscription";
import { requireClerkAuth } from "./requireClerkAuth";
import { requireMatchingSession } from "./requireMatchingSession";

/** Sign-in, single-device session, plus active/trialing Stripe subscription. */
export const requireEntitledUser: RequestHandler[] = [
  requireClerkAuth,
  requireMatchingSession,
  requireActiveSubscription,
];
