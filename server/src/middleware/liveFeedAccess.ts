import type { NextFunction, Request, Response } from "express";

/**
 * Live incident APIs used by `/desk` (snapshot + SSE) are public.
 * Stripe/auth middleware must not wrap these routes — EventSource cannot
 * attach an Authorization header, so a paywall here empties the feed.
 */
export const LIVE_FEED_PATHS = ["/api/health", "/api/incidents", "/api/sources"] as const;

export function isLiveFeedRequest(req: Request): boolean {
  const path = req.path.startsWith("/api") ? req.path : `/api${req.path}`;
  return LIVE_FEED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function publicLiveFeed(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
