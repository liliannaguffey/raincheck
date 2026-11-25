import { expect, test, vi } from "vitest";
import { createOpenWeather } from "./openWeather.ts";

const point = { lat: 29.65, lng: -82.32 };
const now = () => Date.parse("2030-06-15T00:00:00Z");
const epoch = now() / 1000;

test("normalizes the metric forecast series and preserves optional value semantics", async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      list: [
        { dt: epoch + 10800, main: { temp: 16 }, pop: 0 },
        {
          dt: epoch,
          main: { temp: 20, feels_like: 21, humidity: 60 },
          weather: [
            { id: 500, main: "Rain", description: "light rain", icon: "10d" },
          ],
          pop: 0.4,
          rain: { "3h": 1.25 },
          snow: { "3h": 0 },
          wind: { speed: 4, gust: 7, deg: 180 },
          visibility: 7650,
          clouds: { all: 95 },
        },
      ],
    }),
  );
  const series = await createOpenWeather({
    key: "test-key",
    fetcher,
    now,
  }).fetchSeries(point);
  expect(series.retrievedAtUtc).toBe("2030-06-15T00:00:00.000Z");
  expect(series.forecasts[0]).toMatchObject({
    timestampUtc: series.retrievedAtUtc,
    temperatureC: 20,
    feelsLikeC: 21,
    humidityPercent: 60,
    conditionId: 500,
    condition: "Rain",
    description: "light rain",
    iconId: "10d",
    precipitationProbability: 0.4,
    rainMm: 1.25,
    snowMm: 0,
    windMetersPerSecond: 4,
    gustMetersPerSecond: 7,
    windDirectionDegrees: 180,
    visibilityMeters: 7650,
    cloudPercent: 95,
  });
  expect(series.forecasts[1]?.precipitationProbability).toBe(0);
  expect(series.forecasts[1]?.snowMm).toBeUndefined();
  const url = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(url.pathname).toBe("/data/2.5/forecast");
  expect(url.searchParams.get("units")).toBe("metric");
  expect(url.searchParams.get("lat")).toBe("29.65");
});

test.each([
  [401, "WEATHER_ACCESS_DENIED"],
  [403, "WEATHER_ACCESS_DENIED"],
  [429, "WEATHER_RATE_LIMIT"],
  [503, "WEATHER_UNAVAILABLE"],
])(
  "normalizes provider HTTP %i without including provider details",
  async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private provider text", { status }));
    await expect(
      createOpenWeather({ key: "test-key", fetcher }).fetchSeries(point),
    ).rejects.toMatchObject({ code, message: code });
  },
);

test.each([{}, { list: [{ dt: "bad" }] }, { list: Array(41).fill({}) }])(
  "rejects invalid provider responses",
  async (payload) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payload));
    await expect(
      createOpenWeather({ key: "test-key", fetcher }).fetchSeries(point),
    ).rejects.toMatchObject({ code: "INVALID_WEATHER_RESPONSE" });
  },
);

test("distinguishes a valid empty series from an invalid response", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ list: [] }));
  await expect(
    createOpenWeather({ key: "test-key", fetcher }).fetchSeries(point),
  ).resolves.toMatchObject({ forecasts: [] });
});

test("handles missing configuration and network errors without leaking details", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("private URL"));
  await expect(
    createOpenWeather({ key: "", fetcher }).fetchSeries(point),
  ).rejects.toMatchObject({ code: "WEATHER_NOT_CONFIGURED" });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    createOpenWeather({ key: "test-key", fetcher }).fetchSeries(point),
  ).rejects.toMatchObject({
    code: "WEATHER_UNAVAILABLE",
    message: "WEATHER_UNAVAILABLE",
  });
});

test("applies an abortable timeout", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_, init) => {
    await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
    return Response.json({});
  });
  await expect(
    createOpenWeather({ key: "test-key", fetcher, timeoutMs: 5 }).fetchSeries(
      point,
    ),
  ).rejects.toMatchObject({ code: "WEATHER_TIMEOUT" });
});
