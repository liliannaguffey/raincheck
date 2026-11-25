import { Temporal } from "@js-temporal/polyfill";
import type { RouteSample } from "@raincheck/shared";
import { isCoordinate } from "../routes/geometry.ts";

export function isUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    return false;
  try {
    return Temporal.Instant.from(value).epochMilliseconds === Date.parse(value);
  } catch {
    return false;
  }
}

export const sampleLimit = 256;
const kinds = new Set(["origin", "intermediate", "waypoint", "destination"]);

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readSample(value: unknown): RouteSample | undefined {
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
    !isUtcTimestamp(arrivalUtc) ||
    (name !== undefined && (typeof name !== "string" || name.length > 512)) ||
    (timeZone !== undefined &&
      (typeof timeZone !== "string" || timeZone.length > 80))
  )
    return;

  try {
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
