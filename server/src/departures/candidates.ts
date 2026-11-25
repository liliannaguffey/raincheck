import { Temporal } from "@js-temporal/polyfill";
import type { DepartureFlexibility, RouteSample } from "@raincheck/shared";
import { arrivalAt } from "../routes/time.ts";

export const departureDefaults = {
  hours: 3,
  direction: "either",
  intervalMinutes: 30,
} as const satisfies DepartureFlexibility;

export const maximumCandidates = 25;

export function generateDepartures(
  departureUtc: string,
  {
    hours,
    direction,
    intervalMinutes = departureDefaults.intervalMinutes,
  }: DepartureFlexibility = departureDefaults,
  now = Date.now(),
) {
  const original = Temporal.Instant.from(departureUtc).epochMilliseconds;
  const stride = intervalMinutes * 60;
  const steps = (hours * 3600) / stride;
  if (
    !Number.isInteger(steps) ||
    steps < 0 ||
    2 * steps + 1 > maximumCandidates
  ) {
    throw new RangeError("Invalid departure search window");
  }
  const start = direction === "later" ? 0 : -steps;
  const end = direction === "earlier" ? 0 : steps;
  const candidates: { departureUtc: string; offsetSeconds: number }[] = [];
  for (let step = start; step <= end; step++) {
    const offsetSeconds = step * stride || 0;
    const epoch = original + offsetSeconds * 1000;
    if (offsetSeconds !== 0 && epoch < now) continue;
    candidates.push({
      departureUtc: Temporal.Instant.fromEpochMilliseconds(epoch).toString(),
      offsetSeconds,
    });
  }
  return candidates;
}

export function shiftArrivals(
  samples: RouteSample[],
  departureUtc: string,
): RouteSample[] {
  return samples.map((sample) => ({
    ...sample,
    arrivalUtc: arrivalAt(departureUtc, sample.elapsedSeconds),
  }));
}

export function localClock(
  utc: string,
  timeZone: string,
  precision: "minute" | "second" = "minute",
) {
  return Temporal.Instant.from(utc)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: precision });
}
