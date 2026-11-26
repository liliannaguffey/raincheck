import type { DepartureRequest, RouteSample } from "@raincheck/shared";
import request from "supertest";
import { expect, test, vi } from "vitest";
import { createApp } from "../app.ts";
import type { ForecastProvider } from "../weather/openWeather.ts";
import { createRouteWeather } from "../weather/service.ts";
import { createDepartureService } from "./service.ts";

const departureUtc = "2030-06-15T12:00:00Z";
const now = () => Date.parse("2030-06-15T06:00:00Z");
const samples: RouteSample[] = [
  {
    id: "a",
    coordinate: { lat: 29, lng: -82 },
    arrivalUtc: departureUtc,
    kind: "origin",
    distanceMeters: 0,
    elapsedSeconds: 0,
    timeZone: "America/New_York",
  },
  {
    id: "b",
    coordinate: { lat: 29.5, lng: -82 },
    arrivalUtc: "2030-06-15T13:00:00Z",
    kind: "destination",
    distanceMeters: 50000,
    elapsedSeconds: 3600,
    timeZone: "America/Chicago",
  },
];
const input: DepartureRequest = {
  departureUtc,
  samples,
  flexibility: { hours: 3, direction: "either" },
};
const slots = [9, 12, 15, 18].map((hour) => ({
  timestampUtc: `2030-06-15T${String(hour).padStart(2, "0")}:00:00Z`,
  conditionId: hour === 12 ? 211 : 800,
  windMetersPerSecond: 5,
  visibilityMeters: 10000,
}));
const series = { retrievedAtUtc: "2030-06-15T06:00:00Z", forecasts: slots };

function configuration(
  fetchSeries: ForecastProvider["fetchSeries"],
  ttlMs?: number,
) {
  const weather = createRouteWeather({
    now,
    ttlMs,
    provider: { resolutionSeconds: 10800, horizonSeconds: 432000, fetchSeries },
  });
  return request(
    createApp(undefined, weather, createDepartureService(weather, { now })),
  );
}

test("reuses route weather cache across alternatives and returns route-free preview data", async () => {
  const fetchSeries = vi.fn().mockResolvedValue(series);
  const api = configuration(fetchSeries);
  await api.post("/api/weather/route").send({ samples }).expect(200);
  const result = await api
    .post("/api/departures/recommendations")
    .send(input)
    .expect(200);
  expect(result.body).toMatchObject({
    status: "available",
    evaluatedCount: 13,
    baseline: {
      score: 100,
      originTimeZone: "America/New_York",
      destinationTimeZone: "America/Chicago",
    },
  });
  expect(result.body.recommendations[0]).toMatchObject({
    offsetSeconds: 7200,
    departureLocal: "2030-06-15T10:00",
    arrivalLocal: "2030-06-15T10:00:00",
    score: 0,
    improvement: { hazardousSeconds: 3600, scorePoints: 100 },
    points: [
      {
        id: "a",
        coordinate: samples[0]?.coordinate,
        arrivalUtc: "2030-06-15T14:00:00Z",
      },
      {
        id: "b",
        coordinate: samples[1]?.coordinate,
        arrivalUtc: "2030-06-15T15:00:00Z",
      },
    ],
  });
  expect(result.body.candidates).toHaveLength(13);
  expect(result.body.candidates[0]).toMatchObject({
    offsetSeconds: -10800,
    departureUtc: "2030-06-15T09:00:00Z",
  });
  expect(result.body.candidates[0]).not.toHaveProperty("points");
  expect(result.body.recommendations[0]).not.toHaveProperty("route");
  expect(fetchSeries).toHaveBeenCalledTimes(2);
});

test("fetches each location once for a comparison even without retained caching", async () => {
  const fetchSeries = vi.fn().mockResolvedValue({ ...series, cacheForMs: 0 });
  const api = configuration(fetchSeries, 0);
  const result = await api
    .post("/api/departures/recommendations")
    .send({ ...input, flexibility: { hours: 6, direction: "either" } })
    .expect(200);
  expect(result.body.evaluatedCount).toBe(25);
  expect(fetchSeries).toHaveBeenCalledTimes(2);
});

test.each([
  { ...input, samples: [] },
  { ...input, samples: Array(257).fill(samples[0]) },
  {
    ...input,
    samples: [{ ...samples[0], coordinate: { lat: 91, lng: -82 } }, samples[1]],
  },
  {
    ...input,
    samples: [
      samples[0],
      { ...samples[1], arrivalUtc: "2030-06-15T13:05:00Z" },
    ],
  },
  { ...input, samples: [...samples].reverse() },
  { ...input, departureUtc: "2030-02-30T12:00:00Z" },
  { ...input, flexibility: { hours: 10, direction: "either" } },
  {
    ...input,
    flexibility: { hours: 3, direction: "either", intervalMinutes: 1 },
  },
  { ...input, flexibility: { hours: 3, direction: "sideways" } },
])(
  "rejects invalid comparison inputs before forecast calls",
  async (payload) => {
    const fetchSeries = vi.fn();
    const res = await configuration(fetchSeries)
      .post("/api/departures/recommendations")
      .send(payload)
      .expect(400);
    expect(res.body.error.code).toBe("INVALID_DEPARTURE_COMPARISON");
    expect(fetchSeries).not.toHaveBeenCalled();
  },
);

test("returns coverage and provider failure states without losing the baseline", async () => {
  const partial = vi
    .fn()
    .mockResolvedValue(series)
    .mockRejectedValueOnce(new Error("offline"));
  const res = await configuration(partial)
    .post("/api/departures/recommendations")
    .send(input)
    .expect(200);
  expect(res.body).toMatchObject({
    status: "insufficient-coverage",
    recommendations: [],
    baseline: { coverageFraction: 0 },
  });
  expect(partial).toHaveBeenCalledTimes(2);
  const rejected = await configuration(
    vi.fn().mockRejectedValue(new Error("offline")),
  )
    .post("/api/departures/recommendations")
    .send(input)
    .expect(200);
  expect(rejected.body.status).toBe("weather-unavailable");
});

test("preserves the original on equivalent forecast slots and avoids requests outside the horizon", async () => {
  const fair = vi.fn().mockResolvedValue({
    ...series,
    forecasts: slots.map((slot) => ({ ...slot, conditionId: 800 })),
  });
  const res = await configuration(fair)
    .post("/api/departures/recommendations")
    .send(input)
    .expect(200);
  expect(res.body).toMatchObject({
    status: "no-improvement",
    recommendations: [],
  });
  const futureSamples = samples.map((s) => ({
    ...s,
    arrivalUtc: s.arrivalUtc.replace("-15T", "-30T"),
  }));
  const forecast = vi.fn();
  const future = await configuration(forecast)
    .post("/api/departures/recommendations")
    .send({
      ...input,
      departureUtc: futureSamples[0]?.arrivalUtc,
      samples: futureSamples,
    })
    .expect(200);
  expect(future.body.status).toBe("insufficient-coverage");
  expect(forecast).not.toHaveBeenCalled();
});
