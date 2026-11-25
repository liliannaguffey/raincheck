import type {
  RouteSample,
  RouteWeatherPoint,
  RouteWeatherResponse,
} from "@raincheck/shared";
import { createForecastCache } from "./cache.ts";
import { matchForecast } from "./match.ts";
import { createOpenWeather, WeatherError } from "./openWeather.ts";
import type { ForecastProvider } from "./openWeather.ts";

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

  return async (samples: RouteSample[]): Promise<RouteWeatherResponse> => {
    const serverTime = now();
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
              await getSeries(sample.coordinate),
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
      points,
      resolutionSeconds,
      horizonSeconds,
    };
  };
}

export type RouteWeatherService = ReturnType<typeof createRouteWeather>;
