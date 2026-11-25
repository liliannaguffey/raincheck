import type { DrivingRoute, RouteLeg } from "@raincheck/shared";
import { expect, test } from "vitest";
import { sampleRoute } from "./sampling.ts";
import { arrivalAt, localDepartureToUtc } from "./time.ts";
import { decodePolyline } from "./geometry.ts";

const departure = "2030-06-15T23:30:00Z";
const point = (lng: number) => ({ lat: 0, lng });

function leg(start: number, end: number, durationSeconds: number): RouteLeg {
  return {
    start: point(start),
    end: point(end),
    coordinates: [point(start), point(start), point(end)],
    distanceMeters: 1000,
    durationSeconds,
    steps: [],
  };
}

function route(...legs: RouteLeg[]): DrivingRoute {
  return {
    distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    coordinates: legs.flatMap((leg) => leg.coordinates),
    encodedPolyline: "",
    legs,
    trafficAware: true,
  };
}

test.each([
  [900, [0, 900]],
  [1800, [0, 1800]],
  [3600, [0, 1800, 3600]],
  [4000, [0, 1800, 3600, 4000]],
])(
  "samples endpoints and elapsed intervals for duration %i",
  (duration, expected) => {
    const { samples, sampling } = sampleRoute(
      route(leg(0, 2, duration)),
      departure,
    );
    expect(samples.map((sample) => sample.elapsedSeconds)).toEqual(expected);
    expect(samples[0]).toMatchObject({ kind: "origin", coordinate: point(0) });
    expect(samples.at(-1)).toMatchObject({
      kind: "destination",
      coordinate: point(2),
    });
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(
      samples.length,
    );
    expect(samples.map((sample) => sample.arrivalUtc)).toEqual(
      samples.map((sample) => sample.arrivalUtc).sort(),
    );
    expect(sampling).toBe("distance-fallback");
  },
);

test("uses different step speeds and the road geometry within the slower step", () => {
  const a = leg(0, 4, 3600);
  a.coordinates = [point(0), point(2), { lat: 1, lng: 2 }, point(4)];
  a.steps = [
    {
      coordinates: [point(0), point(2)],
      staticDurationSeconds: 600,
      distanceMeters: 300,
    },
    {
      coordinates: [point(2), { lat: 1, lng: 2 }, point(4)],
      staticDurationSeconds: 3000,
      distanceMeters: 700,
    },
  ];
  const { samples, sampling } = sampleRoute(route(a), departure, [], 900);
  expect(sampling).toBe("step-duration");
  expect(samples[1]?.coordinate.lng).toBeCloseTo(2);
  expect(samples[1]?.coordinate.lat).toBeGreaterThan(0);
  expect(samples[1]?.distanceMeters).toBeCloseTo(370);
});

test("keeps a waypoint at an interval boundary and scales up to route totals", () => {
  const input = route(leg(0, 1, 900), leg(1, 2, 900));
  input.durationSeconds = 3600;
  input.distanceMeters = 4000;
  const { samples } = sampleRoute(input, departure, [{}, { name: "Stop" }, {}]);
  expect(samples.map(({ kind }) => kind)).toEqual([
    "origin",
    "waypoint",
    "destination",
  ]);
  expect(samples[1]).toMatchObject({
    elapsedSeconds: 1800,
    distanceMeters: 2000,
    name: "Stop",
    arrivalUtc: "2030-06-16T00:00:00Z",
  });
});

test("rejects missing leg geometry and invalid coordinates", () => {
  const a = leg(0, 1, 1800);
  expect(() =>
    sampleRoute(route({ ...a, coordinates: [] }), departure),
  ).toThrow();
  expect(() =>
    sampleRoute(
      route({ ...a, coordinates: [point(0), point(200)] }),
      departure,
    ),
  ).toThrow();
  expect(() => sampleRoute(route(), departure)).toThrow();
});

test("decodes Google geometry and rejects truncated data", () => {
  expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ]);
  expect(() => decodePolyline("_")).toThrow();
});

test("uses the origin zone and handles same-day, overnight, multi-day and cross-zone arrivals", () => {
  const utc = localDepartureToUtc("2030-06-15T08:00", "America/New_York");
  expect(utc).toBe("2030-06-15T12:00:00Z");
  expect(arrivalAt(utc, 3600)).toBe("2030-06-15T13:00:00Z");
  expect(arrivalAt(utc, 13 * 3600)).toBe("2030-06-16T01:00:00Z");
  expect(arrivalAt(utc, 49 * 3600)).toBe("2030-06-17T13:00:00Z");
  expect(localDepartureToUtc("2030-06-15T08:00", "America/Chicago")).toBe(
    "2030-06-15T13:00:00Z",
  );
});

test("rejects invalid and ambiguous departures and adds elapsed time across DST", () => {
  expect(() =>
    localDepartureToUtc("2026-03-08T02:30", "America/New_York"),
  ).toThrow();
  expect(() =>
    localDepartureToUtc("2026-11-01T01:30", "America/New_York"),
  ).toThrow();
  expect(() =>
    localDepartureToUtc("2026-02-30T01:30", "America/New_York"),
  ).toThrow();
  expect(() => arrivalAt("invalid", 60)).toThrow();
  const utc = localDepartureToUtc("2026-03-08T01:30", "America/New_York");
  expect(arrivalAt(utc, 3600)).toBe(
    localDepartureToUtc("2026-03-08T03:30", "America/New_York"),
  );
});

test("deduplicates a waypoint colocated with the destination", () => {
  const last = { ...leg(1, 1, 0), distanceMeters: 0 };
  const { samples } = sampleRoute(route(leg(0, 1, 1800), last), departure);
  expect(samples.map(({ kind }) => kind)).toEqual(["origin", "destination"]);
  expect(samples[1]).toMatchObject({
    coordinate: point(1),
    elapsedSeconds: 1800,
  });
});
