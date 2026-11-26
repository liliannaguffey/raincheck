import type { DepartureRequest, DepartureResponse } from "@raincheck/shared";
import type { RouteWeatherService } from "../weather/service.ts";
import { generateDepartures, shiftArrivals } from "./candidates.ts";
import {
  comparisonEligibility,
  evaluateExposure,
  exposureDefaults,
  rankDepartures,
} from "./exposure.ts";
import type { ExposureOptions } from "./exposure.ts";

export function createDepartureService(
  weather: RouteWeatherService,
  {
    now = Date.now,
    options = exposureDefaults,
  }: { now?: () => number; options?: ExposureOptions } = {},
) {
  return async ({
    departureUtc,
    samples,
    flexibility,
  }: DepartureRequest): Promise<DepartureResponse> => {
    const candidates = generateDepartures(departureUtc, flexibility, now());
    const evaluateWeather = weather.createBatch();
    const baselineWeather = await evaluateWeather(samples);
    const baseline = evaluateExposure(
      samples,
      baselineWeather.points,
      departureUtc,
      0,
      options,
    );
    const response: DepartureResponse = {
      baseline: baseline.candidate,
      evaluatedCount: 1,
      candidates: [baseline.candidate],
      recommendations: [],
      minimumCoverage: options.minimumCoverage,
      resolutionSeconds: baselineWeather.resolutionSeconds,
      horizonSeconds: baselineWeather.horizonSeconds,
      status: "no-improvement",
    };
    if (!flexibility.hours) return { ...response, status: "no-flexibility" };
    if (candidates.length === 1)
      return { ...response, status: "no-future-candidates" };
    if (baseline.candidate.eligibility !== "eligible") {
      const unavailable =
        !baselineWeather.points.some(({ status }) => status === "available") &&
        baselineWeather.points.some(({ status }) => status === "failed");
      return {
        ...response,
        status: unavailable ? "weather-unavailable" : "insufficient-coverage",
      };
    }

    const alternatives = await Promise.all(
      candidates
        .filter(({ offsetSeconds }) => offsetSeconds)
        .map(async ({ departureUtc, offsetSeconds }) => {
          const shifted = shiftArrivals(samples, departureUtc);
          const { points } = await evaluateWeather(shifted);
          return evaluateExposure(
            shifted,
            points,
            departureUtc,
            offsetSeconds,
            options,
          );
        }),
    );
    const recommendations = rankDepartures(baseline, alternatives, options);
    const summaries = alternatives.map((alternative) => ({
      ...alternative.candidate,
      eligibility: comparisonEligibility(baseline, alternative),
    }));
    return {
      ...response,
      evaluatedCount: alternatives.length + 1,
      candidates: [...summaries, baseline.candidate].sort(
        (a, b) => a.offsetSeconds - b.offsetSeconds,
      ),
      recommendations,
      status: recommendations.length
        ? "available"
        : summaries.some(({ eligibility }) => eligibility === "eligible")
          ? "no-improvement"
          : "insufficient-coverage",
    };
  };
}

export type DepartureService = ReturnType<typeof createDepartureService>;
