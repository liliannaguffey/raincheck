import type { RouteSample } from "@raincheck/shared";
import { expect, test } from "vitest";
import { generateDepartures, localClock, shiftArrivals } from "./candidates.ts";

const start = "2030-06-15T12:00:00Z";
const before = Date.parse("2030-06-14T00:00:00Z");

test("generates the 13 defaults in chronological UTC order and keeps the baseline", () => {
  const candidates = generateDepartures(start, undefined, before);
  expect(candidates).toHaveLength(13);
  expect(candidates[0]?.departureUtc).toBe("2030-06-15T09:00:00Z");
  expect(candidates[6]).toEqual({ departureUtc: start, offsetSeconds: 0 });
  expect(candidates.at(-1)?.departureUtc).toBe("2030-06-15T15:00:00Z");
});

test.each([
  [{ hours: 0, direction: "either" }, [0]],
  [{ hours: 1, direction: "earlier" }, [-3600, -1800, 0]],
  [{ hours: 2, direction: "later", intervalMinutes: 60 }, [0, 3600, 7200]],
] as const)("supports flexibility options %j", (settings, expected) => {
  expect(
    generateDepartures(start, settings, before).map(
      ({ offsetSeconds }) => offsetSeconds,
    ),
  ).toEqual(expected);
});

test("drops past alternatives and caps a six-hour search at 25 candidates", () => {
  expect(
    generateDepartures(
      start,
      undefined,
      Date.parse("2030-06-15T11:40:00Z"),
    ).map(({ offsetSeconds }) => offsetSeconds),
  ).toEqual([0, 1800, 3600, 5400, 7200, 9000, 10800]);
  expect(
    generateDepartures(start, { hours: 6, direction: "either" }, before),
  ).toHaveLength(25);
});

test("crosses local midnight and a DST gap using elapsed time", () => {
  const overnight = generateDepartures(
    "2030-06-15T04:30:00Z",
    { hours: 1, direction: "earlier" },
    before,
  );
  expect(localClock(overnight[0]!.departureUtc, "America/New_York")).toBe(
    "2030-06-14T23:30",
  );
  const spring = generateDepartures(
    "2026-03-08T06:30:00Z",
    { hours: 1, direction: "later" },
    0,
  );
  expect(localClock(spring[1]!.departureUtc, "America/New_York")).toBe(
    "2026-03-08T03:00",
  );
});

test("shifts multi-day arrivals without changing sample geometry or duration", () => {
  const origin: RouteSample = {
    id: "a",
    coordinate: { lat: 29, lng: -82 },
    kind: "origin",
    elapsedSeconds: 0,
    distanceMeters: 0,
    arrivalUtc: start,
    timeZone: "America/New_York",
  };
  const end: RouteSample = {
    ...origin,
    id: "b",
    coordinate: { lat: 30, lng: -90 },
    kind: "destination",
    elapsedSeconds: 32 * 3600,
    distanceMeters: 900000,
    timeZone: "America/Chicago",
  };
  const shifted = shiftArrivals([origin, end], "2030-06-15T11:30:00Z");
  expect(shifted[0]).toMatchObject({
    ...origin,
    arrivalUtc: "2030-06-15T11:30:00Z",
  });
  expect(shifted[1]).toMatchObject({
    ...end,
    arrivalUtc: "2030-06-16T19:30:00Z",
  });
  expect(localClock(shifted[1]!.arrivalUtc, shifted[1]!.timeZone!)).toBe(
    "2030-06-16T14:30",
  );
  expect(
    shiftArrivals([origin, end], "2030-06-15T13:00:00Z")[1]?.arrivalUtc,
  ).toBe("2030-06-16T21:00:00Z");
});
