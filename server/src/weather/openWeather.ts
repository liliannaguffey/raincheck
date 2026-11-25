import type {
  Forecast,
  RouteCoordinate,
  WeatherFailureCode,
} from "@raincheck/shared";

export interface ForecastSeries {
  forecasts: Forecast[];
  retrievedAtUtc: string;
}

export interface ForecastProvider {
  resolutionSeconds: number;
  horizonSeconds: number;
  fetchSeries(coordinate: RouteCoordinate): Promise<ForecastSeries>;
}

export class WeatherError extends Error {
  readonly code: WeatherFailureCode;

  constructor(code: WeatherFailureCode) {
    super(code);
    this.code = code;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown, minimum = -Infinity, maximum = Infinity) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize(value: unknown): Forecast | undefined {
  const item = object(value);
  const epoch = number(item.dt, 0, 253_402_300_799);
  if (epoch === undefined || !Number.isInteger(epoch)) return;

  const main = object(item.main);
  const condition = object(
    Array.isArray(item.weather) ? item.weather[0] : undefined,
  );
  const wind = object(item.wind);
  const forecast = {
    timestampUtc: new Date(epoch * 1000).toISOString(),
    temperatureC: number(main.temp),
    feelsLikeC: number(main.feels_like),
    condition: string(condition.main),
    description: string(condition.description),
    conditionId: number(condition.id, 0),
    iconId: string(condition.icon),
    precipitationProbability: number(item.pop, 0, 1),
    rainMm: number(object(item.rain)["3h"], 0),
    snowMm: number(object(item.snow)["3h"], 0),
    windMetersPerSecond: number(wind.speed, 0),
    gustMetersPerSecond: number(wind.gust, 0),
    windDirectionDegrees: number(wind.deg, 0, 360),
    visibilityMeters: number(item.visibility, 0),
    humidityPercent: number(main.humidity, 0, 100),
    cloudPercent: number(object(item.clouds).all, 0, 100),
  };
  if (Object.values(forecast).filter((field) => field !== undefined).length > 1)
    return forecast;
}

export function createOpenWeather({
  key = process.env.OPENWEATHER_API_KEY,
  fetcher = fetch,
  now = Date.now,
  timeoutMs = 6000,
}: {
  key?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
} = {}): ForecastProvider {
  return {
    resolutionSeconds: 3 * 3600,
    horizonSeconds: 5 * 86400,
    async fetchSeries({ lat, lng }) {
      if (!key?.trim()) throw new WeatherError("WEATHER_NOT_CONFIGURED");

      const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
      url.search = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        units: "metric",
        appid: key.trim(),
      }).toString();
      const signal = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetcher(url, { signal, redirect: "error" });
      } catch {
        throw new WeatherError(
          signal.aborted ? "WEATHER_TIMEOUT" : "WEATHER_UNAVAILABLE",
        );
      }
      if (response.status === 401 || response.status === 403)
        throw new WeatherError("WEATHER_ACCESS_DENIED");
      if (response.status === 429) throw new WeatherError("WEATHER_RATE_LIMIT");
      if (!response.ok) throw new WeatherError("WEATHER_UNAVAILABLE");

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new WeatherError(
          signal.aborted ? "WEATHER_TIMEOUT" : "INVALID_WEATHER_RESPONSE",
        );
      }
      const { list } = object(data);
      if (!Array.isArray(list) || list.length > 40)
        throw new WeatherError("INVALID_WEATHER_RESPONSE");
      const unique = new Map<string, Forecast>();
      for (const item of list) {
        const forecast = normalize(item);
        if (forecast && !unique.has(forecast.timestampUtc))
          unique.set(forecast.timestampUtc, forecast);
      }
      if (list.length && !unique.size)
        throw new WeatherError("INVALID_WEATHER_RESPONSE");
      return {
        forecasts: [...unique.values()].sort((a, b) =>
          a.timestampUtc.localeCompare(b.timestampUtc),
        ),
        retrievedAtUtc: new Date(now()).toISOString(),
      };
    },
  };
}
