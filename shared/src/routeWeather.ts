import type {
  RouteCoordinate,
  RouteHazardSection,
  RouteResponse,
  RouteWeatherPoint,
  RouteWeatherSegment,
  RouteWeatherSummary,
  WeatherClassification,
  WeatherHazard,
  WeatherSeverity,
} from "./index.ts";

const longitudeDelta = (delta: number) => ((delta + 540) % 360) - 180;
const toRadians = Math.PI / 180;
const metersPerDegree = 111195;
const rank: Record<WeatherSeverity, number> = {
  unknown: 0,
  favorable: 1,
  caution: 2,
  hazardous: 3,
};

function strongest(a: WeatherSeverity, b: WeatherSeverity) {
  return rank[a] >= rank[b] ? a : b;
}

export function assessment(point?: RouteWeatherPoint): WeatherClassification {
  return (
    point?.classification ?? {
      severity: "unknown",
      hazards: [],
      availability: point?.status ?? "unavailable",
      completeness: point?.status === "available" ? "limited" : "unavailable",
      explanation:
        "There is insufficient forecast information to assess this sample.",
    }
  );
}

function routePath(path: RouteCoordinate[]) {
  const edge = path.slice(1).map((end, index) => {
    const start = path[index]!;
    const lng = longitudeDelta(end.lng - start.lng);
    const lat = end.lat - start.lat;
    const longitudeScale = Math.cos(((start.lat + end.lat) / 2) * toRadians);
    const length = metersPerDegree * Math.hypot(lat, lng * longitudeScale);
    return { start, end, lat, lng, longitudeScale, length };
  });
  const distances = [0];
  for (const { length } of edge) distances.push(distances.at(-1)! + length);

  function coordinateAt(position: number): RouteCoordinate {
    const index = Math.floor(position);
    const piece = edge[index];
    const fraction = position - index;
    if (!piece || !fraction) return path[index]!;
    return {
      lat: piece.start.lat + piece.lat * fraction,
      lng: longitudeDelta(piece.start.lng + piece.lng * fraction),
    };
  }

  return {
    project(point: RouteCoordinate, minimum: number, progress: number) {
      const expected = distances.at(-1)! * progress;
      let best = minimum;
      let minimumError = Infinity;
      for (let index = Math.floor(minimum); index < edge.length; index++) {
        const segment = edge[index]!;
        const x =
          longitudeDelta(point.lng - segment.start.lng) *
          segment.longitudeScale;
        const y = point.lat - segment.start.lat;
        const dx = segment.lng * segment.longitudeScale;
        const dy = segment.lat;
        const floor = index === Math.floor(minimum) ? minimum - index : 0;
        const along = (dx * x + dy * y) / (dx * dx + dy * dy || 1);
        const fraction = Math.min(1, Math.max(floor, along));
        const offset = distances[index]! + segment.length * fraction;
        // Prefer the expected distance when the route doubles back close to itself.
        const error =
          metersPerDegree * Math.hypot(x - dx * fraction, y - dy * fraction) +
          Math.abs(offset - expected) * 0.0001;
        if (error < minimumError) {
          best = index + fraction;
          minimumError = error;
        }
      }
      return best;
    },
    slice(from: number, to: number) {
      if (from === to) return [coordinateAt(from)];
      const vertices = [coordinateAt(from)];
      for (let i = Math.floor(from) + 1; i < to; i++) vertices.push(path[i]!);
      vertices.push(coordinateAt(to));
      return vertices;
    },
  };
}

function combineHazards(hazards: WeatherHazard[]) {
  const combined = new Map<WeatherHazard["id"], WeatherHazard>();
  for (const hazard of hazards) {
    const previous = combined.get(hazard.id);
    if (!previous || rank[hazard.severity] > rank[previous.severity])
      combined.set(hazard.id, hazard);
  }
  return [...combined.values()];
}

export function segmentRouteWeather(
  { route, samples }: RouteResponse,
  points: RouteWeatherPoint[],
): RouteWeatherSegment[] {
  if (!route.coordinates.length || samples.length < 2) return [];
  const assessed = new Map(
    points.map((point) => [point.id, assessment(point)]),
  );
  const path = routePath(route.coordinates);
  const segments: RouteWeatherSegment[] = [];
  let startPosition = 0;

  for (let i = 1; i < samples.length; i++) {
    const start = samples[i - 1]!;
    const end = samples[i]!;
    const endPosition =
      i === samples.length - 1
        ? route.coordinates.length - 1
        : path.project(
            end.coordinate,
            startPosition,
            route.distanceMeters
              ? end.distanceMeters / route.distanceMeters
              : 0,
          );
    const from = assessed.get(start.id) ?? assessment();
    const to = assessed.get(end.id) ?? assessment();
    segments.push({
      id: `weather-section-${i}`,
      coordinates: path.slice(startPosition, endPosition),
      start,
      end,
      severity:
        from.severity === "unknown" || to.severity === "unknown"
          ? "unknown"
          : strongest(from.severity, to.severity),
      distanceMeters: Math.max(0, end.distanceMeters - start.distanceMeters),
      durationSeconds: Math.max(0, end.elapsedSeconds - start.elapsedSeconds),
      hazards: combineHazards([...from.hazards, ...to.hazards]),
    });
    startPosition = endPosition;
  }
  return segments;
}

export function groupRouteHazards(
  samples: RouteResponse["samples"],
  points: RouteWeatherPoint[],
  segments: RouteWeatherSegment[],
): RouteHazardSection[] {
  const assessed = new Map(
    points.map((point) => [point.id, assessment(point)]),
  );
  const groups: RouteHazardSection[] = [];
  let previous = new Map<WeatherHazard["id"], RouteHazardSection>();
  for (const sample of samples) {
    const current = new Map<WeatherHazard["id"], RouteHazardSection>();
    for (const hazard of assessed.get(sample.id)?.hazards ?? []) {
      let group = previous.get(hazard.id);
      if (group && sample.elapsedSeconds - group.end.elapsedSeconds <= 3600) {
        group.end = sample;
        group.sampleIds.push(sample.id);
        if (rank[hazard.severity] > rank[group.hazard.severity])
          group.hazard = hazard;
      } else {
        group = {
          id: `${hazard.id}-${sample.id}`,
          hazard,
          start: sample,
          end: sample,
          sampleIds: [sample.id],
          segmentIds: [],
        };
        groups.push(group);
      }
      current.set(hazard.id, group);
    }
    previous = current;
  }

  const bySample = new Map<string, string[]>();
  for (const { id, start, end } of segments) {
    for (const sampleId of new Set([start.id, end.id])) {
      const linked = bySample.get(sampleId) ?? [];
      linked.push(id);
      bySample.set(sampleId, linked);
    }
  }
  for (const group of groups) {
    group.segmentIds = [
      ...new Set(group.sampleIds.flatMap((id) => bySample.get(id) ?? [])),
    ];
  }
  return groups;
}

export function summarizeRouteWeather(
  segments: RouteWeatherSegment[],
  points: RouteWeatherPoint[],
): RouteWeatherSummary {
  const bySeverity: RouteWeatherSummary["bySeverity"] = {
    unknown: { seconds: 0, meters: 0, sections: 0 },
    favorable: { seconds: 0, meters: 0, sections: 0 },
    caution: { seconds: 0, meters: 0, sections: 0 },
    hazardous: { seconds: 0, meters: 0, sections: 0 },
  };
  let last: WeatherSeverity | undefined;
  let meters = 0;
  for (const segment of segments) {
    const bucket = bySeverity[segment.severity];
    bucket.seconds += segment.durationSeconds;
    bucket.meters += segment.distanceMeters;
    meters += segment.distanceMeters;
    if (!segment.distanceMeters && !segment.durationSeconds) continue;
    if (last !== segment.severity) bucket.sections++;
    last = segment.severity;
  }
  const highest = points.reduce<WeatherSeverity>(
    (severity, point) => strongest(severity, assessment(point).severity),
    "unknown",
  );
  // Keep isolated observed hazards, while requiring complete segment coverage for an overall favorable label.
  const severity =
    highest === "favorable" && (!meters || bySeverity.unknown.meters > 0)
      ? "unknown"
      : highest;
  return {
    severity,
    bySeverity,
    coverageFraction: meters
      ? (meters - bySeverity.unknown.meters) / meters
      : null,
    exposureSeconds: bySeverity.caution.seconds + bySeverity.hazardous.seconds,
  };
}
