import type {
  RouteErrorResponse,
  RoutePlace,
  RouteRequest,
  RouteResponse,
} from "@raincheck/shared";
import { json, Router } from "express";
import type { ErrorRequestHandler } from "express";
import { RouteError } from "./errors.ts";
import { isCoordinate } from "./geometry.ts";
import type { RouteService } from "./service.ts";
import { localDepartureToUtc } from "./time.ts";

function place(value: unknown): RoutePlace | undefined {
  if (typeof value !== "object" || !value) return;
  const { placeId, address, coordinate } = value as Partial<RoutePlace>;
  if (
    typeof placeId !== "string" ||
    !/^[\w-]{1,512}$/.test(placeId) ||
    typeof address !== "string" ||
    !address.trim() ||
    address.length > 512 ||
    !isCoordinate(coordinate)
  )
    return;
  return { placeId, address: address.trim(), coordinate };
}

function validate(value: unknown): RouteRequest {
  if (!value || typeof value !== "object")
    throw new RouteError(
      400,
      "INVALID_REQUEST",
      "Send a trip as a JSON object.",
    );
  const input = value as Partial<RouteRequest>;
  const origin = place(input.origin);
  const destination = place(input.destination);
  if (!origin || !destination || origin.placeId === destination.placeId) {
    throw new RouteError(
      400,
      "INVALID_LOCATIONS",
      "Select distinct starting and destination locations.",
    );
  }

  const waypoints: RoutePlace[] = [];
  const stops = input.waypoints === undefined ? [] : input.waypoints;
  if (!Array.isArray(stops) || stops.length > 8) {
    throw new RouteError(
      400,
      "INVALID_WAYPOINTS",
      "Select up to eight intermediate stops.",
    );
  }
  for (const stop of stops) {
    const valid = place(stop);
    if (!valid)
      throw new RouteError(
        400,
        "INVALID_WAYPOINTS",
        "Each stop must be a selected location.",
      );
    waypoints.push(valid);
  }

  try {
    if (typeof input.departureLocal !== "string") throw new RangeError();
    localDepartureToUtc(input.departureLocal, "UTC");
  } catch {
    throw new RouteError(
      400,
      "INVALID_DEPARTURE",
      "Enter a valid departure date and time.",
    );
  }

  return {
    origin,
    destination,
    waypoints,
    departureLocal: input.departureLocal,
  };
}

export function routeRouter(calculate: RouteService) {
  const router = Router();
  router.post<never, RouteResponse | RouteErrorResponse, unknown>(
    "/",
    json({ limit: "16kb" }),
    async (req, res) => {
      const controller = new AbortController();
      res.once("close", () => controller.abort());
      try {
        const result = await calculate(validate(req.body), controller.signal);
        if (!controller.signal.aborted) res.json(result);
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure =
          error instanceof RouteError
            ? error
            : new RouteError(
                500,
                "ROUTE_FAILURE",
                "The route could not be calculated. Try again.",
              );
        res
          .status(failure.status)
          .json({ error: { code: failure.code, message: failure.message } });
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
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Send a valid JSON trip under 16 KB.",
      },
    });
  };
  router.use(bodyError);
  return router;
}
