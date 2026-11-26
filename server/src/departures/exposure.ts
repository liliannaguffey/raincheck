import type {
  DepartureCandidate,
  DepartureRecommendation,
  RouteSample,
  RouteWeatherPoint,
  WeatherSeverity,
} from "@raincheck/shared";
import { assessment, weatherIntervals } from "@raincheck/shared/route-weather";
import { localClock } from "./candidates.ts";

export interface ExposureOptions {
  weights: Record<WeatherSeverity, number>;
  minimumCoverage: number;
  minimumScoreImprovement: number;
  minimumHazardReductionSeconds: number;
  recommendationLimit: number;
}

export const exposureDefaults: ExposureOptions = {
  weights: { favorable: 0, caution: 1, hazardous: 3, unknown: 3 },
  minimumCoverage: 0.9,
  minimumScoreImprovement: 5,
  minimumHazardReductionSeconds: 900,
  recommendationLimit: 3,
};

export function evaluateExposure(
  samples: RouteSample[],
  points: RouteWeatherPoint[],
  departureUtc: string,
  offsetSeconds: number,
  options: ExposureOptions = exposureDefaults,
) {
  const origin = samples[0]!;
  const destination = samples.at(-1)!;
  const originTimeZone = origin.timeZone ?? "UTC";
  const destinationTimeZone = destination.timeZone ?? "UTC";
  const intervals = weatherIntervals(samples, points);
  const exposure: DepartureCandidate["exposure"] = {
    favorable: 0,
    caution: 0,
    hazardous: 0,
    unknown: 0,
  };
  const hazards: DepartureCandidate["hazards"] = {};
  for (const interval of intervals) {
    exposure[interval.severity] += interval.durationSeconds;
    for (const hazard of interval.hazards) {
      const existing = hazards[hazard.id];
      hazards[hazard.id] = {
        label: existing?.label ?? hazard.label,
        seconds:
          (existing?.seconds ?? 0) +
          (interval.severity === "unknown" ? 0 : interval.durationSeconds),
      };
    }
  }
  for (const point of points) {
    for (const hazard of assessment(point).hazards)
      hazards[hazard.id] ??= { label: hazard.label, seconds: 0 };
  }

  const durationSeconds = intervals.reduce(
    (sum, interval) => sum + interval.durationSeconds,
    0,
  );
  const coverageFraction = durationSeconds
    ? (durationSeconds - exposure.unknown) / durationSeconds
    : 0;
  const maximum = durationSeconds * Math.max(...Object.values(options.weights));
  const weighted = (Object.keys(exposure) as WeatherSeverity[]).reduce(
    (sum, severity) => sum + exposure[severity] * options.weights[severity],
    0,
  );
  const candidate: DepartureCandidate = {
    id: departureUtc,
    departureUtc,
    departureLocal: localClock(departureUtc, originTimeZone),
    originTimeZone,
    arrivalUtc: destination.arrivalUtc,
    arrivalLocal: localClock(
      destination.arrivalUtc,
      destinationTimeZone,
      "second",
    ),
    destinationTimeZone,
    offsetSeconds,
    durationSeconds,
    exposure,
    coverageFraction,
    hazards,
    score: maximum ? (weighted / maximum) * 100 : null,
    eligibility:
      maximum && coverageFraction >= options.minimumCoverage
        ? "eligible"
        : "insufficient-coverage",
  };
  const signature = JSON.stringify(
    intervals.map(({ severity, hazards }) => [
      severity,
      hazards.map((hazard) => `${hazard.id}:${hazard.severity}`).sort(),
    ]),
  );
  return { candidate, points, intervals, signature };
}

export type EvaluatedDeparture = ReturnType<typeof evaluateExposure>;

export function comparisonEligibility(
  baseline: EvaluatedDeparture,
  alternative: EvaluatedDeparture,
): DepartureCandidate["eligibility"] {
  if (alternative.candidate.eligibility !== "eligible")
    return alternative.candidate.eligibility;
  const lost = baseline.intervals.some((interval, index) => {
    const next = alternative.intervals[index];
    return (
      interval.durationSeconds > 0 &&
      interval.severity !== "unknown" &&
      (!next || next.severity === "unknown")
    );
  });
  return lost ? "reduced-coverage" : "eligible";
}

export function rankDepartures(
  baseline: EvaluatedDeparture,
  alternatives: EvaluatedDeparture[],
  options: ExposureOptions = exposureDefaults,
) {
  if (baseline.candidate.eligibility !== "eligible") return [];
  const original = baseline.candidate;
  const maxWeight = Math.max(...Object.values(options.weights));
  const ranked = alternatives
    .flatMap((evaluated) => {
      const { candidate, intervals } = evaluated;
      if (
        comparisonEligibility(baseline, evaluated) !== "eligible" ||
        evaluated.signature === baseline.signature
      )
        return [];
      let comparableSeconds = 0;
      let weightedReduction = 0;
      for (const [index, interval] of baseline.intervals.entries()) {
        if (interval.severity === "unknown" || !interval.durationSeconds)
          continue;
        const alternative = intervals[index]!;
        comparableSeconds += interval.durationSeconds;
        weightedReduction +=
          interval.durationSeconds *
          (options.weights[interval.severity] -
            options.weights[alternative.severity]);
      }

      const scorePoints = comparableSeconds
        ? (weightedReduction / (comparableSeconds * maxWeight)) * 100
        : 0;
      const hazardousSeconds =
        original.exposure.hazardous - candidate.exposure.hazardous;
      if (
        hazardousSeconds < 0 ||
        (hazardousSeconds < options.minimumHazardReductionSeconds &&
          scorePoints < options.minimumScoreImprovement)
      )
        return [];

      const improvement: DepartureRecommendation["improvement"] = {
        scorePoints,
        hazardousSeconds,
        cautionSeconds: original.exposure.caution - candidate.exposure.caution,
        reducedHazards: Object.entries(original.hazards).flatMap(
          ([id, hazard]) => {
            const next =
              candidate.hazards[id as keyof typeof candidate.hazards]
                ?.seconds ?? 0;
            return next < hazard.seconds
              ? [
                  {
                    label: hazard.label,
                    originalSeconds: hazard.seconds,
                    candidateSeconds: next,
                  },
                ]
              : [];
          },
        ),
        newHazards: Object.entries(candidate.hazards).flatMap(([id, hazard]) =>
          original.hazards[id as keyof typeof original.hazards]
            ? []
            : [hazard.label],
        ),
      };
      return [{ ...evaluated, improvement }];
    })
    .sort(
      (a, b) =>
        b.improvement.hazardousSeconds - a.improvement.hazardousSeconds ||
        (a.candidate.score ?? Infinity) - (b.candidate.score ?? Infinity) ||
        b.candidate.coverageFraction - a.candidate.coverageFraction ||
        Math.abs(a.candidate.offsetSeconds) -
          Math.abs(b.candidate.offsetSeconds) ||
        a.candidate.offsetSeconds - b.candidate.offsetSeconds,
    );

  const signatures = new Set<string>();
  const unique = ranked.filter(({ signature }) => {
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
  const best = unique[0];
  if (!best) return [];
  const earlier = unique.find(({ candidate }) => candidate.offsetSeconds < 0);
  const later = unique.find(({ candidate }) => candidate.offsetSeconds > 0);
  const selected = [...new Set([best, earlier, later, ...unique])]
    .filter((item) => item !== undefined)
    .slice(0, options.recommendationLimit);
  return selected.map((item): DepartureRecommendation => ({
    ...item.candidate,
    points: item.points,
    improvement: item.improvement,
    distinction:
      item === best
        ? "best-overall"
        : item === earlier
          ? "best-earlier"
          : item === later
            ? "best-later"
            : "alternative",
  }));
}
