import type { RouteSample, RouteWeatherPoint } from "@raincheck/shared";
import type { ForecastSeries } from "./openWeather.ts";

export function matchForecast(
  sample: RouteSample,
  { forecasts, retrievedAtUtc }: ForecastSeries,
  resolutionSeconds: number,
): RouteWeatherPoint {
  const arrival = Date.parse(sample.arrivalUtc);
  const tolerance = resolutionSeconds * 500;
  const first = forecasts[0];
  const last = forecasts.at(-1);
  if (!first || !last) return { ...sample, status: "unavailable" };
  if (
    arrival < Date.parse(first.timestampUtc) - tolerance ||
    arrival > Date.parse(last.timestampUtc)
  ) {
    return { ...sample, status: "outside-range" };
  }

  // Series are sorted by UTC timestamp. Keep the earlier slot on a tie.
  let match: (typeof forecasts)[number] | undefined;
  let offset = Infinity;
  for (const forecast of forecasts) {
    const difference = Date.parse(forecast.timestampUtc) - arrival;
    if (Math.abs(difference) < Math.abs(offset)) {
      offset = difference;
      match = forecast;
    }
  }

  if (!match || Math.abs(offset) > tolerance)
    return { ...sample, status: "unavailable" };
  return {
    ...sample,
    status: "available",
    forecast: match,
    offsetSeconds: offset / 1000,
    retrievedAtUtc,
  };
}
