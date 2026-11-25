import type { HealthResponse } from "@raincheck/shared";
import express from "express";

import { routeRouter } from "./routes/http.ts";
import { createRouteService } from "./routes/service.ts";

export function createApp(calculateRoute = createRouteService()) {
  const app = express();

  app.disable("x-powered-by");
  app.get<never, HealthResponse>("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/routes", routeRouter(calculateRoute));
  return app;
}
