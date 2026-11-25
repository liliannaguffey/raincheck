import type { RouteSample } from "@raincheck/shared";
import { expect, test } from "vitest";
import { matchForecast } from "./match.ts";

const sample: RouteSample = {
  id: "destination",
  kind: "destination",
  arrivalUtc: "2030-06-16T00:00:00Z",
  coordinate: { lat: 30, lng: -87 },
  elapsedSeconds: 86400,
  distanceMeters: 500000,
  timeZone: "America/Chicago",
};
const retrievedAtUtc = "2030-06-14T00:00:00Z";
const series = (times: string[]) => ({
  forecasts: times.map((timestampUtc) => ({
    timestampUtc,
    condition: "Clear",
  })),
  retrievedAtUtc,
});
const timeline = series([
  "2030-06-15T21:00:00Z",
  "2030-06-16T00:00:00Z",
  "2030-06-16T03:00:00Z",
]);

test.each([
  ["2030-06-16T00:00:00Z", "2030-06-16T00:00:00Z", 0],
  ["2030-06-15T23:30:00Z", "2030-06-16T00:00:00Z", 1800],
  ["2030-06-15T22:30:00Z", "2030-06-15T21:00:00Z", -5400],
  ["2030-06-15T19:30:00Z", "2030-06-15T21:00:00Z", 5400],
  ["2030-06-16T03:00:00Z", "2030-06-16T03:00:00Z", 0],
])(
  "matches %s in UTC with the documented tie and boundary rules",
  (arrivalUtc, timestampUtc, offsetSeconds) => {
    expect(
      matchForecast({ ...sample, arrivalUtc }, timeline, 10800),
    ).toMatchObject({
      status: "available",
      forecast: { timestampUtc },
      offsetSeconds,
      retrievedAtUtc,
      arrivalUtc,
      timeZone: sample.timeZone,
      elapsedSeconds: sample.elapsedSeconds,
    });
  },
);

test.each([
  "2030-06-15T19:29:59Z",
  "2030-06-16T03:00:01Z",
  "2030-06-20T00:00:00Z",
])("reports arrivals outside the supplied forecast range", (arrivalUtc) => {
  expect(matchForecast({ ...sample, arrivalUtc }, timeline, 10800).status).toBe(
    "outside-range",
  );
});

test("reports empty series and missing interior intervals without inventing forecasts", () => {
  expect(matchForecast(sample, series([]), 10800).status).toBe("unavailable");
  expect(
    matchForecast(
      sample,
      series(["2030-06-15T21:00:00Z", "2030-06-16T03:00:00Z"]),
      10800,
    ).status,
  ).toBe("unavailable");
});
