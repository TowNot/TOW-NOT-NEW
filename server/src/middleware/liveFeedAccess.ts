import type { NextFunction, Request, Response } from "express";

/**
 * Legacy no-op — live feeds are subscription-gated in app.ts via Clerk session cookies.
 */
export function publicLiveFeed(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
