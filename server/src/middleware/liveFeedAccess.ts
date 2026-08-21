import type { NextFunction, Request, Response } from "express";

/**
 * Live incident APIs used by `/desk` (snapshot + SSE) stay public.
 * Clerk `clerkMiddleware()` still runs so cookies are parsed, but these
 * routes are not gated with `requireClerkAuth` — EventSource cannot attach
 * an Authorization header, and a hard gate would empty the feed.
 */
export const LIVE_FEED_PATHS = ["/api/health", "/api/incidents", "/api/sources"] as const;

export function isLiveFeedRequest(req: Request): boolean {
  const path = req.path.startsWith("/api") ? req.path : `/api${req.path}`;
  return LIVE_FEED_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function publicLiveFeed(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
