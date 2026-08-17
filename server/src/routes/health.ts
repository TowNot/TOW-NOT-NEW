import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "townot-2-server",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
