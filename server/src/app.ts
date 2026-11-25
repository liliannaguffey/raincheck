import type { HealthResponse } from "@raincheck/shared";
import express from "express";

import { routeRouter } from "./routes/http.ts";
import { createRouteService } from "./routes/service.ts";

import { weatherRouter } from "./weather/http.ts";
import { createRouteWeather } from "./weather/service.ts";

export function createApp(
  calculateRoute = createRouteService(),
  getWeather = createRouteWeather(),
) {
  const app = express();

  app.disable("x-powered-by");
  app.get<never, HealthResponse>("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/routes", routeRouter(calculateRoute));
  app.use("/api/weather", weatherRouter(getWeather));
  return app;
}
