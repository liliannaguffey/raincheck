import { expect, test, vi } from "vitest";
import { createForecastCache } from "./cache.ts";
import type { ForecastProvider, ForecastSeries } from "./openWeather.ts";
import { WeatherError } from "./openWeather.ts";

const origin = { lat: 29, lng: -82 };
const start = Date.parse("2030-06-15T00:00:00Z");
const forecast: ForecastSeries = {
  forecasts: [{ timestampUtc: "2030-06-16T00:00:00Z" }],
  retrievedAtUtc: "2030-06-15T00:00:00Z",
};
const provider = (
  fetchSeries: ForecastProvider["fetchSeries"],
): ForecastProvider => ({
  resolutionSeconds: 10800,
  horizonSeconds: 432000,
  fetchSeries,
});

test("shares pending and cached series, and refreshes when the TTL expires", async () => {
  let time = start;
  const fetchSeries = vi.fn().mockResolvedValue(forecast);
  const get = createForecastCache(provider(fetchSeries), {
    now: () => time,
    ttlMs: 1000,
  });
  const first = get(origin);
  expect(get({ ...origin })).toBe(first);
  await first;
  await get(origin);
  await get({ ...origin, lat: 30 });
  expect(fetchSeries).toHaveBeenCalledTimes(2);
  time += 1000;
  await get(origin);
  expect(fetchSeries).toHaveBeenCalledTimes(3);
});

test("honors provider cache constraints and keeps the cache bounded", async () => {
  const fetchSeries = vi
    .fn()
    .mockResolvedValue(forecast)
    .mockResolvedValueOnce({ ...forecast, cacheForMs: 0 });
  const get = createForecastCache(provider(fetchSeries), {
    now: () => start,
    capacity: 1,
  });
  await get(origin);
  await get(origin);
  await get({ ...origin, lat: 30 });
  await get(origin);
  expect(fetchSeries).toHaveBeenCalledTimes(4);
});

test("limits concurrency and queued work", async () => {
  const completions: ((series: ForecastSeries) => void)[] = [];
  const fetchSeries = vi.fn(
    () => new Promise<ForecastSeries>((resolve) => completions.push(resolve)),
  );
  const get = createForecastCache(provider(fetchSeries), {
    concurrency: 2,
    maxPending: 3,
    now: () => start,
  });
  const batch = [29, 30, 31].map((lat) => get({ lat, lng: -82 }));
  await expect(get({ lat: 32, lng: -82 })).rejects.toMatchObject({
    code: "WEATHER_RATE_LIMIT",
  });
  expect(fetchSeries).toHaveBeenCalledTimes(2);
  completions[0]?.(forecast);
  await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(3));
  completions.slice(1).forEach((finish) => finish(forecast));
  await Promise.all(batch);
});

test("enforces the rolling request budget and does not cache a failed forecast", async () => {
  let time = start;
  const fetchSeries = vi
    .fn()
    .mockRejectedValueOnce(new WeatherError("WEATHER_TIMEOUT"))
    .mockResolvedValue(forecast);
  const get = createForecastCache(provider(fetchSeries), {
    now: () => time,
    requestsPerMinute: 2,
  });
  await expect(get(origin)).rejects.toMatchObject({ code: "WEATHER_TIMEOUT" });
  await get(origin);
  await expect(get({ ...origin, lat: 30 })).rejects.toMatchObject({
    code: "WEATHER_RATE_LIMIT",
  });
  expect(fetchSeries).toHaveBeenCalledTimes(2);
  time += 60_000;
  await get({ ...origin, lat: 30 });
  expect(fetchSeries).toHaveBeenCalledTimes(3);
});

test("backs off temporarily after a provider denial or rate limit", async () => {
  let time = start;
  const fetchSeries = vi
    .fn()
    .mockRejectedValueOnce(new WeatherError("WEATHER_ACCESS_DENIED"))
    .mockResolvedValue(forecast);
  const get = createForecastCache(provider(fetchSeries), { now: () => time });
  await expect(get(origin)).rejects.toMatchObject({
    code: "WEATHER_ACCESS_DENIED",
  });
  await expect(get({ lat: 30, lng: -82 })).rejects.toMatchObject({
    code: "WEATHER_ACCESS_DENIED",
  });
  expect(fetchSeries).toHaveBeenCalledTimes(1);
  time += 60_000;
  await get(origin);
  expect(fetchSeries).toHaveBeenCalledTimes(2);
});
