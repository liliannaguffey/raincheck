import type {
  DepartureFlexibility,
  DepartureRequest,
  DepartureResponse,
  RouteErrorResponse,
  RouteSample,
} from "@raincheck/shared";
import { json, Router } from "express";
import type { ErrorRequestHandler } from "express";
import { isUtcTimestamp, readSample, sampleLimit } from "../weather/samples.ts";
import type { DepartureService } from "./service.ts";

function validate(value: unknown): DepartureRequest | undefined {
  if (typeof value !== "object" || !value) return;
  const {
    departureUtc,
    samples: submitted,
    flexibility,
  } = value as Partial<DepartureRequest>;
  if (
    !isUtcTimestamp(departureUtc) ||
    !Array.isArray(submitted) ||
    submitted.length < 2 ||
    submitted.length > sampleLimit ||
    !flexibility ||
    typeof flexibility !== "object"
  )
    return;

  const { hours, intervalMinutes, direction } = flexibility;
  if (
    ![0, 1, 2, 3, 6].includes(hours) ||
    !["earlier", "later", "either"].includes(direction) ||
    (intervalMinutes !== undefined &&
      intervalMinutes !== 30 &&
      intervalMinutes !== 60)
  )
    return;

  const samples: RouteSample[] = [];
  const ids = new Set<string>();
  const startMs = Date.parse(departureUtc);
  for (const [index, value] of submitted.entries()) {
    const sample = readSample(value);
    if (
      !sample ||
      ids.has(sample.id) ||
      Date.parse(sample.arrivalUtc) - startMs !==
        Math.round(sample.elapsedSeconds * 1000)
    )
      return;
    const previous = samples.at(-1);
    if (
      previous &&
      (sample.elapsedSeconds < previous.elapsedSeconds ||
        sample.distanceMeters < previous.distanceMeters)
    )
      return;
    if (
      index === 0
        ? sample.kind !== "origin" ||
          sample.elapsedSeconds !== 0 ||
          sample.distanceMeters !== 0
        : index === submitted.length - 1
          ? sample.kind !== "destination"
          : sample.kind !== "intermediate" && sample.kind !== "waypoint"
    )
      return;
    samples.push(sample);
    ids.add(sample.id);
  }

  const options: DepartureFlexibility = { hours, direction, intervalMinutes };
  return { samples, departureUtc, flexibility: options };
}

export function departureRouter(recommend: DepartureService) {
  const router = Router();
  router.post<never, DepartureResponse | RouteErrorResponse, unknown>(
    "/recommendations",
    json({ limit: "128kb" }),
    async (req, res) => {
      const request = validate(req.body);
      if (!request) {
        res.status(400).json({
          error: {
            code: "INVALID_DEPARTURE_COMPARISON",
            message:
              "Provide a valid ordered route and a supported departure window and interval.",
          },
        });
        return;
      }
      try {
        res.json(await recommend(request));
      } catch {
        res
          .status(502)
          .json({
            error: {
              code: "DEPARTURE_COMPARISON_FAILED",
              message: "Departure times could not be compared. Try again.",
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
        code: "INVALID_DEPARTURE_COMPARISON",
        message: "Send valid comparison JSON no larger than 128 KB.",
      },
    });
  };
  router.use(bodyError);
  return router;
}
