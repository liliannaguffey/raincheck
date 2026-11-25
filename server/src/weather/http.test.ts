import type { RouteSample } from "@raincheck/shared";
import request from "supertest";
import { expect, test, vi } from "vitest";
import { createApp } from "../app.ts";
import { WeatherError } from "./openWeather.ts";
import type { ForecastProvider } from "./openWeather.ts";
import { createRouteWeather } from "./service.ts";

const sample: RouteSample = {
  id: "origin",
  kind: "origin",
  coordinate: { lat: 29, lng: -82 },
  arrivalUtc: "2030-06-15T22:00:00Z",
  elapsedSeconds: 0,
  distanceMeters: 0,
  timeZone: "America/New_York",
};
const now = () => Date.parse("2030-06-15T12:00:00Z");
const resolutionSeconds = 10800;
const horizonSeconds = 432000;

function api(fetchSeries: ForecastProvider["fetchSeries"] = vi.fn()) {
  const getWeather = createRouteWeather({
    now,
    provider: { resolutionSeconds, horizonSeconds, fetchSeries },
  });
  return request(createApp(undefined, getWeather));
}

test("returns chronological partial forecasts across midnight and zone boundaries", async () => {
  const fetchSeries = vi
    .fn<ForecastProvider["fetchSeries"]>()
    .mockResolvedValue({
      retrievedAtUtc: "2030-06-15T12:00:00Z",
      forecasts: [
        { timestampUtc: "2030-06-15T21:00:00Z", temperatureC: 24 },
        { timestampUtc: "2030-06-16T00:00:00Z", temperatureC: 22 },
      ],
    })
    .mockRejectedValueOnce(new WeatherError("WEATHER_TIMEOUT"));
  const destination = {
    ...sample,
    id: "destination",
    kind: "destination",
    coordinate: { lat: 30, lng: -88 },
    arrivalUtc: "2030-06-16T00:00:00Z",
    elapsedSeconds: 7200,
    timeZone: "America/Chicago",
  };
  const future = {
    ...sample,
    id: "future",
    arrivalUtc: "2030-06-22T00:00:00Z",
  };
  const response = await api(fetchSeries)
    .post("/api/weather/route")
    .send({ samples: [future, destination, sample] })
    .expect(200);
  expect(response.body).toMatchObject({
    provider: "OpenWeather",
    resolutionSeconds,
    horizonSeconds,
    points: [
      { id: "origin", status: "failed", code: "WEATHER_TIMEOUT" },
      {
        id: "destination",
        timeZone: "America/Chicago",
        arrivalUtc: destination.arrivalUtc,
        status: "available",
        forecast: { temperatureC: 22, timestampUtc: destination.arrivalUtc },
        offsetSeconds: 0,
      },
      { id: "future", status: "outside-range" },
    ],
  });
  expect(fetchSeries).toHaveBeenCalledTimes(2);
});

test("shares a series across arrivals and repeated requests", async () => {
  const fetchSeries = vi.fn().mockResolvedValue({
    retrievedAtUtc: sample.arrivalUtc,
    forecasts: [
      { timestampUtc: "2030-06-15T21:00:00Z", temperatureC: 23 },
      { timestampUtc: "2030-06-16T00:00:00Z", temperatureC: 20 },
    ],
  });
  const server = api(fetchSeries);
  const samples = [
    sample,
    { ...sample, id: "stop", arrivalUtc: "2030-06-15T23:30:00Z" },
  ];
  const result = await server
    .post("/api/weather/route")
    .send({ samples })
    .expect(200);
  expect(
    result.body.points.map(
      (point: { offsetSeconds: number }) => point.offsetSeconds,
    ),
  ).toEqual([-3600, 1800]);
  await server.post("/api/weather/route").send({ samples }).expect(200);
  expect(fetchSeries).toHaveBeenCalledOnce();
});

test.each(
  [
    [],
    [sample, sample],
    [{ ...sample, coordinate: { lat: 91, lng: 0 } }],
    [{ ...sample, arrivalUtc: "2030-02-30T00:00:00Z" }],
    [{ ...sample, arrivalUtc: "2016-12-31T23:59:60Z" }],
    [{ ...sample, arrivalUtc: "2030-06-15T22:00:00-04:00" }],
    [null],
    Array(257).fill(sample),
  ].map((samples) => ({ samples })),
)("rejects malformed sample arrays before fetching", async ({ samples }) => {
  const fetchSeries = vi.fn();
  await api(fetchSeries)
    .post("/api/weather/route")
    .send({ samples })
    .expect(400);
  expect(fetchSeries).not.toHaveBeenCalled();
});

test("returns JSON errors for bad JSON and an excessive body", async () => {
  const server = api();
  await server
    .post("/api/weather/route")
    .type("json")
    .send("{")
    .expect(400)
    .expect("Content-Type", /json/);
  await server
    .post("/api/weather/route")
    .send({ extra: "x".repeat(140_000) })
    .expect(413);
});

test("returns structured missing configuration and preserves point metadata", async () => {
  const server = request(
    createApp(undefined, createRouteWeather({ key: "", now })),
  );
  const result = await server
    .post("/api/weather/route")
    .send({ samples: [sample] })
    .expect(200);
  expect(result.body.points[0]).toMatchObject({
    ...sample,
    status: "failed",
    code: "WEATHER_NOT_CONFIGURED",
  });
});
