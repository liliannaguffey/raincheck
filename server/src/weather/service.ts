import type {
  RouteSample,
  RouteWeatherPoint,
  RouteWeatherResponse,
} from "@raincheck/shared";
import { createForecastCache } from "./cache.ts";
import { classifyPoint } from "./severity.ts";
import { matchForecast } from "./match.ts";
import { createOpenWeather, WeatherError } from "./openWeather.ts";
import type { ForecastProvider, ForecastSeries } from "./openWeather.ts";

function configuredTtl() {
  const raw = process.env.WEATHER_CACHE_TTL_SECONDS?.trim();
  const seconds = Number(raw);
  return raw && Number.isInteger(seconds) && seconds >= 0 && seconds <= 3600
    ? seconds * 1000
    : 600_000;
}

export function createRouteWeather({
  key = process.env.OPENWEATHER_API_KEY,
  provider,
  now = Date.now,
  ttlMs = configuredTtl(),
}: {
  key?: string;
  provider?: ForecastProvider;
  now?: () => number;
  ttlMs?: number;
} = {}) {
  const active = provider ?? createOpenWeather({ key, now });
  const getSeries = createForecastCache(active, { now, ttlMs });
  const { resolutionSeconds, horizonSeconds } = active;

  function createBatch() {
    const serverTime = now();
    const series = new Map<string, Promise<ForecastSeries>>();
    const resolveSeries = (coordinate: RouteSample["coordinate"]) => {
      const location = `${coordinate.lat},${coordinate.lng}`;
      const existing = series.get(location);
      if (existing) return existing;
      const lookup = getSeries(coordinate);
      series.set(location, lookup);
      return lookup;
    };

    return async (samples: RouteSample[]): Promise<RouteWeatherResponse> => {
      const points = await Promise.all(
        [...samples]
          .sort((a, b) => Date.parse(a.arrivalUtc) - Date.parse(b.arrivalUtc))
          .map(async (sample): Promise<RouteWeatherPoint> => {
            const arrival = Date.parse(sample.arrivalUtc);
            if (
              arrival > serverTime + horizonSeconds * 1000 ||
              arrival < serverTime - resolutionSeconds * 500
            ) {
              return { ...sample, status: "outside-range" };
            }
            if (!provider && !key?.trim())
              return {
                ...sample,
                status: "failed",
                code: "WEATHER_NOT_CONFIGURED",
              };

            try {
              return matchForecast(
                sample,
                await resolveSeries(sample.coordinate),
                resolutionSeconds,
              );
            } catch (error) {
              return {
                ...sample,
                status: "failed",
                code:
                  error instanceof WeatherError
                    ? error.code
                    : "WEATHER_UNAVAILABLE",
              };
            }
          }),
      );
      return {
        provider: "OpenWeather",
        points: points.map((point) => classifyPoint(point, resolutionSeconds)),
        resolutionSeconds,
        horizonSeconds,
      };
    };
  }

  return Object.assign((samples: RouteSample[]) => createBatch()(samples), {
    createBatch,
  });
}

export type RouteWeatherService = ReturnType<typeof createRouteWeather>;
