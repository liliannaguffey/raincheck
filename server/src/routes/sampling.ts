import type { DrivingRoute, RouteLeg, RouteSample } from "@raincheck/shared";
import { isCoordinate, measurePath } from "./geometry.ts";
import { arrivalAt } from "./time.ts";

interface StopLabel {
  name?: string;
  timeZone?: string;
}

function legSegments(leg: RouteLeg) {
  if (!isCoordinate(leg.start) || !isCoordinate(leg.end)) {
    throw new RangeError("Invalid leg endpoints");
  }

  const legPath = measurePath(leg.coordinates);
  if (!legPath.length && leg.distanceMeters > 0) {
    throw new RangeError("Missing geometry for driving leg");
  }

  const timed =
    leg.steps.length > 0 &&
    leg.steps.every(
      (step) =>
        step.coordinates.length > 0 &&
        step.staticDurationSeconds !== undefined &&
        Number.isFinite(step.staticDurationSeconds) &&
        (step.staticDurationSeconds > 0 ||
          (step.staticDurationSeconds === 0 && step.distanceMeters === 0)),
    );
  if (!timed)
    return {
      fallback: true,
      segments: [{ path: legPath, weight: 1, distance: 1 }],
    };

  const segments = leg.steps.map((step) => {
    const path = measurePath(step.coordinates);
    return {
      path,
      weight: step.staticDurationSeconds ?? 0,
      distance: step.distanceMeters ?? path.length,
    };
  });
  if (
    !segments.some(({ weight }) => weight > 0) ||
    segments.some(({ path, distance }) => distance > 0 && !path.length)
  ) {
    return {
      fallback: true,
      segments: [{ path: legPath, weight: 1, distance: 1 }],
    };
  }
  return { fallback: false, segments };
}

export function sampleRoute(
  route: DrivingRoute,
  departureUtc: string,
  stops: StopLabel[] = [],
  intervalSeconds = 1800,
): { samples: RouteSample[]; sampling: "step-duration" | "distance-fallback" } {
  if (
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds < 1 ||
    !Number.isFinite(route.durationSeconds) ||
    route.durationSeconds <= 0 ||
    !Number.isFinite(route.distanceMeters) ||
    route.distanceMeters < 0 ||
    !route.legs.length ||
    route.legs.some(
      (leg) =>
        !Number.isFinite(leg.durationSeconds) ||
        leg.durationSeconds < 0 ||
        !Number.isFinite(leg.distanceMeters) ||
        leg.distanceMeters < 0,
    )
  ) {
    throw new RangeError("Invalid route totals or sampling interval");
  }

  const first = route.legs[0]!;
  const durationTotal = route.legs.reduce(
    (sum, leg) => sum + leg.durationSeconds,
    0,
  );
  const distanceTotal = route.legs.reduce(
    (sum, leg) => sum + leg.distanceMeters,
    0,
  );
  if (!durationTotal || (!distanceTotal && route.distanceMeters > 0)) {
    throw new RangeError("Missing leg totals");
  }

  const samples: RouteSample[] = [];
  function include(
    kind: RouteSample["kind"],
    coordinate: RouteSample["coordinate"],
    elapsedSeconds: number,
    distanceMeters: number,
    label?: StopLabel,
  ) {
    samples.push({
      id: `${kind}-${samples.length}`,
      kind,
      coordinate,
      elapsedSeconds,
      distanceMeters,
      arrivalUtc: arrivalAt(departureUtc, elapsedSeconds),
      ...label,
    });
  }

  include("origin", first.start, 0, 0, stops[0]);
  let next = intervalSeconds;
  let elapsed = 0;
  let distance = 0;
  let fallback = false;
  const tolerance = 1e-6;

  for (const [index, leg] of route.legs.entries()) {
    const { segments, fallback: legFallback } = legSegments(leg);
    fallback ||= legFallback && leg.durationSeconds > 0;
    const legDuration =
      (leg.durationSeconds * route.durationSeconds) / durationTotal;
    const legDistance = distanceTotal
      ? (leg.distanceMeters * route.distanceMeters) / distanceTotal
      : 0;
    const legEnd =
      index === route.legs.length - 1
        ? route.durationSeconds
        : elapsed + legDuration;
    const distanceEnd =
      index === route.legs.length - 1
        ? route.distanceMeters
        : distance + legDistance;
    const weight = segments.reduce((sum, segment) => sum + segment.weight, 0);
    const totalDistance = segments.reduce(
      (sum, segment) => sum + segment.distance,
      0,
    );
    let stepStart = elapsed;
    let stepDistance = distance;

    for (const [stepIndex, segment] of segments.entries()) {
      const end =
        stepIndex === segments.length - 1
          ? legEnd
          : stepStart + (legDuration * segment.weight) / weight;
      const endDistance =
        stepIndex === segments.length - 1
          ? distanceEnd
          : stepDistance +
            (totalDistance
              ? (legDistance * segment.distance) / totalDistance
              : 0);

      while (next <= end + tolerance && next < legEnd - tolerance) {
        const fraction = Math.max(
          0,
          Math.min(1, (next - stepStart) / (end - stepStart || 1)),
        );
        include(
          "intermediate",
          segment.path.at(fraction),
          next,
          stepDistance + (endDistance - stepDistance) * fraction,
        );
        next += intervalSeconds;
      }
      stepStart = end;
      stepDistance = endDistance;
    }

    const kind = index === route.legs.length - 1 ? "destination" : "waypoint";
    const previous = samples.at(-1);
    const duplicate =
      previous &&
      previous.elapsedSeconds === legEnd &&
      previous.coordinate.lat === leg.end.lat &&
      previous.coordinate.lng === leg.end.lng;
    if (kind === "destination" || !duplicate) {
      include(kind, leg.end, legEnd, distanceEnd, stops[index + 1]);
    }
    if (Math.abs(next - legEnd) <= tolerance) next += intervalSeconds;
    elapsed = legEnd;
    distance = distanceEnd;
  }

  return {
    samples,
    sampling: fallback ? "distance-fallback" : "step-duration",
  };
}
