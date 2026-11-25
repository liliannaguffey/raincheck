import type { HealthResponse } from "@raincheck/shared";
import express from "express";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.get<never, HealthResponse>("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  return app;
}
