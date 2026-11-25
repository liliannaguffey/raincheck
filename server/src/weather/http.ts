import { Temporal } from "@js-temporal/polyfill";
import type {
  RouteErrorResponse,
  RouteSample,
  RouteWeatherResponse,
} from "@raincheck/shared";
import { json, Router } from "express";
import type { ErrorRequestHandler } from "express";
import { isCoordinate } from "../routes/geometry.ts";
import type { RouteWeatherService } from "./service.ts";

const sampleLimit = 256;
const kinds = new Set(["origin", "intermediate", "waypoint", "destination"]);

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readSample(value: unknown): RouteSample | undefined {
  if (!value || typeof value !== "object") return;
  const {
    id,
    coordinate,
    elapsedSeconds,
    distanceMeters,
    arrivalUtc,
    kind,
    name,
    timeZone,
  } = value as Partial<RouteSample>;
  if (
    typeof id !== "string" ||
    !id.trim() ||
    id.length > 80 ||
    !isCoordinate(coordinate) ||
    !nonnegative(elapsedSeconds) ||
    !nonnegative(distanceMeters) ||
    !kind ||
    !kinds.has(kind) ||
    typeof arrivalUtc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(arrivalUtc) ||
    (name !== undefined && (typeof name !== "string" || name.length > 512)) ||
    (timeZone !== undefined &&
      (typeof timeZone !== "string" || timeZone.length > 80))
  )
    return;

  try {
    if (
      Temporal.Instant.from(arrivalUtc).epochMilliseconds !==
      Date.parse(arrivalUtc)
    )
      return;
    if (timeZone !== undefined) new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    return;
  }
  return {
    id,
    coordinate: { lat: coordinate.lat, lng: coordinate.lng },
    elapsedSeconds,
    distanceMeters,
    arrivalUtc,
    kind,
    name,
    timeZone,
  };
}

export function weatherRouter(getWeather: RouteWeatherService) {
  const router = Router();
  router.post<never, RouteWeatherResponse | RouteErrorResponse, unknown>(
    "/route",
    json({ limit: "128kb" }),
    async (req, res) => {
      const raw = (req.body as { samples?: unknown } | null)?.samples;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > sampleLimit) {
        res.status(400);
        res.json({
          error: {
            code: "INVALID_WEATHER_REQUEST",
            message: "Provide between 1 and 256 route samples.",
          },
        });
        return;
      }

      const samples: RouteSample[] = [];
      const seen = new Set<string>();
      for (const value of raw) {
        const sample = readSample(value);
        if (!sample || seen.has(sample.id)) {
          res.status(400);
          res.json({
            error: {
              code: "INVALID_WEATHER_SAMPLE",
              message:
                "Each route sample needs a unique ID, valid coordinates, and an arrival timestamp in UTC.",
            },
          });
          return;
        }
        samples.push(sample);
        seen.add(sample.id);
      }

      try {
        res.json(await getWeather(samples));
      } catch {
        res.status(502);
        res.json({
          error: {
            code: "WEATHER_UNAVAILABLE",
            message: "Route weather could not be loaded. Try again.",
          },
        });
      }
    },
  );

  const bodyError: ErrorRequestHandler<never, RouteErrorResponse> = (
    error: unknown,
    _req,
    res,
    next,
  ) => {
    if (!error || typeof error !== "object" || !("type" in error)) {
      next(error);
      return;
    }
    res.status(error.type === "entity.too.large" ? 413 : 400).json({
      error: {
        code: "INVALID_WEATHER_REQUEST",
        message: "Send valid route weather JSON no larger than 128 KB.",
      },
    });
  };
  router.use(bodyError);
  return router;
}
