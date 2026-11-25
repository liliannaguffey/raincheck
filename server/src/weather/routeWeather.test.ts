import type {
  RouteResponse,
  RouteSample,
  RouteWeatherPoint,
  WeatherHazard,
  WeatherSeverity,
} from "@raincheck/shared";
import {
  groupRouteHazards,
  segmentRouteWeather,
  summarizeRouteWeather,
} from "@raincheck/shared/route-weather";
import { expect, test } from "vitest";

const coordinate = (lat: number, lng: number) => ({ lat, lng });
const vertices = [
  coordinate(0, 0),
  coordinate(0, 1),
  coordinate(1, 1),
  coordinate(1, 2),
];
const instant = Date.parse("2030-06-01T00:00:00Z");
function sample(
  id: string,
  position: RouteSample["coordinate"],
  elapsedSeconds: number,
  distanceMeters: number,
  kind: RouteSample["kind"],
): RouteSample {
  return {
    id,
    kind,
    coordinate: position,
    elapsedSeconds,
    distanceMeters,
    arrivalUtc: new Date(instant + elapsedSeconds * 1000).toISOString(),
  };
}
const a = sample("a", vertices[0]!, 0, 0, "origin");
const b = sample("b", coordinate(0.5, 1), 1200, 1000, "waypoint");
const c = sample("c", vertices[3]!, 3600, 5000, "destination");
const rain: WeatherHazard = {
  id: "rain",
  category: "rain",
  severity: "caution",
  label: "Rain",
  explanation: "Reduced traction",
};
const gust: WeatherHazard = {
  id: "gust",
  category: "winds",
  severity: "hazardous",
  label: "Gusts",
  explanation: "Difficult steering",
};
function point(
  input: RouteSample,
  severity: WeatherSeverity,
  hazards: WeatherHazard[] = [],
): RouteWeatherPoint {
  const status = severity === "unknown" ? "unavailable" : "available";
  const classification = {
    severity,
    availability: status,
    hazards,
    explanation: "fixture",
    completeness: "sufficient",
  } as const;
  return status === "available"
    ? {
        ...input,
        status,
        classification,
        forecast: { timestampUtc: input.arrivalUtc },
        retrievedAtUtc: input.arrivalUtc,
        offsetSeconds: 0,
      }
    : { ...input, status, classification };
}
function route(samples = [a, b, c], coordinates = vertices): RouteResponse {
  return {
    samples,
    sampling: "step-duration",
    departureUtc: a.arrivalUtc,
    arrivalUtc: c.arrivalUtc,
    route: {
      coordinates,
      distanceMeters: 5000,
      durationSeconds: 3600,
      encodedPolyline: "fixture",
      trafficAware: true,
      legs: [
        {
          start: a.coordinate,
          end: b.coordinate,
          coordinates: vertices.slice(0, 3),
          durationSeconds: 1200,
          distanceMeters: 1000,
          steps: [],
        },
        {
          start: b.coordinate,
          end: c.coordinate,
          coordinates: vertices.slice(2),
          durationSeconds: 2400,
          distanceMeters: 4000,
          steps: [],
        },
      ],
    },
  };
}

test.each(["favorable", "hazardous"] as const)(
  "keeps the full road geometry for a uniformly %s route",
  (severity) => {
    const path = segmentRouteWeather(
      route(),
      [a, b, c].map((s) => point(s, severity)),
    );
    expect(path.map((section) => section.severity)).toEqual([
      severity,
      severity,
    ]);
    expect(path[0]?.coordinates).toEqual([
      vertices[0],
      vertices[1],
      b.coordinate,
    ]);
    expect(path[1]?.coordinates).toEqual([
      b.coordinate,
      vertices[2],
      vertices[3],
    ]);
    expect(path[0]?.coordinates.at(-1)).toEqual(path[1]?.coordinates[0]);
  },
);

test("segments favor the highest known hazard and keep incomplete spans gray", () => {
  const points = [
    point(a, "favorable"),
    point(b, "caution", [rain]),
    point(c, "unknown"),
  ];
  const segments = segmentRouteWeather(route(), points);
  expect(segments.map(({ severity }) => severity)).toEqual([
    "caution",
    "unknown",
  ]);
  expect(summarizeRouteWeather(segments, points)).toMatchObject({
    severity: "caution",
    coverageFraction: 0.2,
    exposureSeconds: 1200,
    bySeverity: {
      caution: { seconds: 1200, meters: 1000, sections: 1 },
      unknown: { seconds: 2400, meters: 4000, sections: 1 },
    },
  });
});

test("supports endpoint-only short routes and duplicate sample positions", () => {
  const close = sample("close", coordinate(0, 0.001), 1, 10, "destination");
  const short = segmentRouteWeather(
    route([a, close], [a.coordinate, close.coordinate]),
    [point(a, "favorable"), point(close, "favorable")],
  );
  expect(short[0]).toMatchObject({
    durationSeconds: 1,
    coordinates: [a.coordinate, close.coordinate],
  });

  const duplicate = { ...b, id: "duplicate" };
  const data = [a, b, duplicate, c];
  const pieces = segmentRouteWeather(
    route(data),
    data.map((s) => point(s, "favorable")),
  );
  expect(pieces[1]?.coordinates).toEqual([b.coordinate]);
  expect(pieces[1]?.durationSeconds).toBe(0);
  expect(
    summarizeRouteWeather(
      pieces,
      data.map((s) => point(s, "favorable")),
    ).bySeverity.favorable.sections,
  ).toBe(1);
});

test("separates gaps and retains overlapping consecutive advisories", () => {
  const points = [
    point(a, "caution", [rain]),
    point(b, "hazardous", [rain, gust]),
    point(c, "hazardous", [gust]),
  ];
  const segments = segmentRouteWeather(route(), points);
  expect(
    groupRouteHazards([a, b, c], points, segments).map((group) => [
      group.hazard.id,
      group.sampleIds,
      group.segmentIds,
    ]),
  ).toEqual([
    ["rain", ["a", "b"], ["weather-section-1", "weather-section-2"]],
    ["gust", ["b", "c"], ["weather-section-1", "weather-section-2"]],
  ]);
  expect(
    groupRouteHazards(
      [a, b, c],
      [point(a, "caution", [rain]), point(c, "caution", [rain])],
      segments,
    ),
  ).toHaveLength(2);
});

test("returns unknown coverage for an unavailable route or an isolated favorable sample", () => {
  const points = [
    point(a, "unknown"),
    point(b, "unknown"),
    point(c, "unknown"),
  ];
  expect(
    summarizeRouteWeather(segmentRouteWeather(route(), points), points),
  ).toMatchObject({
    severity: "unknown",
    coverageFraction: 0,
    exposureSeconds: 0,
  });
  expect(
    summarizeRouteWeather(
      segmentRouteWeather(route(), [point(a, "favorable")]),
      [point(a, "favorable")],
    ).severity,
  ).toBe("unknown");
  expect(
    summarizeRouteWeather([], [point(a, "hazardous", [gust])]),
  ).toMatchObject({ severity: "hazardous", coverageFraction: null });
});
