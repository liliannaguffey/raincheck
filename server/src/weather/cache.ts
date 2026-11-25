import type { RouteCoordinate } from "@raincheck/shared";
import { WeatherError } from "./openWeather.ts";
import type { ForecastProvider, ForecastSeries } from "./openWeather.ts";

interface CacheOptions {
  ttlMs?: number;
  capacity?: number;
  concurrency?: number;
  requestsPerMinute?: number;
  maxPending?: number;
  now?: () => number;
}

export function createForecastCache(
  provider: ForecastProvider,
  {
    ttlMs = 600_000,
    capacity = 256,
    concurrency = 4,
    requestsPerMinute = 50,
    maxPending = 512,
    now = Date.now,
  }: CacheOptions = {},
) {
  const entries = new Map<
    string,
    { series: ForecastSeries; expiresAt: number }
  >();
  const pending = new Map<string, Promise<ForecastSeries>>();
  const queue: (() => void)[] = [];
  const starts: number[] = [];
  let running = 0;
  let cooldown: { until: number; error: WeatherError } | undefined;

  function schedule(run: () => Promise<ForecastSeries>) {
    return new Promise<ForecastSeries>((resolve, reject) => {
      const start = () => {
        const time = now();
        if (cooldown && cooldown.until > time) {
          reject(cooldown.error);
          return;
        }
        while (starts.length && starts[0]! <= time - 60_000) starts.shift();
        if (starts.length >= requestsPerMinute) {
          reject(new WeatherError("WEATHER_RATE_LIMIT"));
          return;
        }

        starts.push(time);
        running++;
        void Promise.resolve()
          .then(run)
          .then(resolve, (error: unknown) => {
            if (
              error instanceof WeatherError &&
              (error.code === "WEATHER_RATE_LIMIT" ||
                error.code === "WEATHER_ACCESS_DENIED")
            ) {
              cooldown = { error, until: now() + 60_000 };
            }
            reject(error);
          })
          .finally(() => {
            running--;
            drain();
          });
      };
      queue.push(start);
      drain();
    });
  }

  function drain() {
    while (running < concurrency && queue.length) queue.shift()?.();
  }

  return function getSeries(
    coordinate: RouteCoordinate,
  ): Promise<ForecastSeries> {
    const key = `${coordinate.lat},${coordinate.lng}`;
    const entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      if (entry.expiresAt > now()) {
        entries.set(key, entry);
        return Promise.resolve(entry.series);
      }
    }
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= maxPending)
      return Promise.reject(new WeatherError("WEATHER_RATE_LIMIT"));

    const task = schedule(() => provider.fetchSeries(coordinate))
      .then((series) => {
        const time = now();
        const latest = series.forecasts.at(-1);
        const expiresAt = Math.min(
          time + Math.min(ttlMs, series.cacheForMs ?? ttlMs),
          latest ? Date.parse(latest.timestampUtc) : time + ttlMs,
        );
        if (expiresAt > time && capacity > 0) {
          entries.set(key, { series, expiresAt });
          if (entries.size > capacity) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) entries.delete(oldest);
          }
        }
        return series;
      })
      .finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}
