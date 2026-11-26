import type {
  RouteSample,
  RouteWeatherPoint,
  WeatherHazard,
  WeatherSeverity,
} from "@raincheck/shared";
import { expect, test } from "vitest";
import { shiftArrivals } from "./candidates.ts";
import {
  comparisonEligibility,
  evaluateExposure,
  exposureDefaults,
  rankDepartures,
} from "./exposure.ts";

const start = Date.parse("2030-06-15T12:00:00Z");
const iso = (offset: number) => new Date(start + offset * 1000).toISOString();
const storm: WeatherHazard = {
  id: "thunderstorm",
  category: "thunderstorms",
  severity: "hazardous",
  label: "Thunderstorms",
  explanation: "Lightning is possible.",
};
const rain: WeatherHazard = {
  id: "rain",
  category: "rain",
  severity: "caution",
  label: "Rain",
  explanation: "Reduced traction.",
};

function itinerary(times: number[]) {
  return times.map((elapsedSeconds, i): RouteSample => ({
    id: String(i),
    coordinate: { lat: 29 + i / 10, lng: -82 },
    elapsedSeconds,
    arrivalUtc: iso(elapsedSeconds),
    distanceMeters: elapsedSeconds * 20,
    kind:
      i === 0
        ? "origin"
        : i === times.length - 1
          ? "destination"
          : "intermediate",
  }));
}

function evaluate(
  severity: WeatherSeverity[],
  offset = 0,
  times = [0, 1800, 5400],
  extra: Partial<Record<number, WeatherHazard[]>> = {},
) {
  const samples = shiftArrivals(itinerary(times), iso(offset));
  const points = samples.map((sample, index): RouteWeatherPoint => {
    const level = severity[index]!;
    if (level === "unknown") return { ...sample, status: "outside-range" };
    return {
      ...sample,
      status: "available",
      forecast: { timestampUtc: sample.arrivalUtc },
      retrievedAtUtc: iso(0),
      offsetSeconds: 0,
      classification: {
        availability: "available",
        completeness: "sufficient",
        severity: level,
        hazards: extra[index] ?? (level === "hazardous" ? [storm] : []),
        explanation: "fixture",
      },
    };
  });
  return evaluateExposure(samples, points, iso(offset), offset);
}

test.each([
  ["favorable", 0],
  ["hazardous", 100],
  ["unknown", 100],
] as const)("normalizes wholly %s exposure to %i", (severity, score) => {
  const outcome = evaluate([severity, severity, severity]);
  expect(outcome.candidate).toMatchObject({
    score,
    exposure: { [severity]: 5400 },
  });
});

test("weights duration and preserves overlapping hazards without double-counting the score", () => {
  const { candidate } = evaluate(
    ["caution", "favorable", "hazardous"],
    0,
    [0, 1800, 5400],
    { 2: [rain, storm] },
  );
  expect(candidate.exposure).toEqual({
    favorable: 0,
    caution: 1800,
    hazardous: 3600,
    unknown: 0,
  });
  expect(candidate.score).toBeCloseTo(77.7778);
  expect(candidate.hazards).toMatchObject({
    rain: { seconds: 3600 },
    thunderstorm: { seconds: 3600 },
  });
});

test("handles zero-duration routes and invalid classifications", () => {
  expect(
    evaluate(["favorable", "favorable"], 0, [0, 0]).candidate,
  ).toMatchObject({
    score: null,
    coverageFraction: 0,
    eligibility: "insufficient-coverage",
  });
  expect(
    evaluate(["unexpected" as WeatherSeverity, "favorable"], 0, [0, 1800])
      .candidate,
  ).toMatchObject({ score: 100, eligibility: "insufficient-coverage" });
});

test("prioritizes hazard reduction and explains new and reduced hazards", () => {
  const original = evaluate(["hazardous", "favorable", "favorable"]);
  const earlier = evaluate(
    ["caution", "favorable", "favorable"],
    -1800,
    undefined,
    { 0: [rain] },
  );
  const later = evaluate(["favorable", "favorable", "favorable"], 3600);
  const ranked = rankDepartures(original, [earlier, later]);
  expect(
    ranked.map(({ offsetSeconds, distinction }) => [
      offsetSeconds,
      distinction,
    ]),
  ).toEqual([
    [3600, "best-overall"],
    [-1800, "best-earlier"],
  ]);
  expect(ranked[1]?.improvement).toMatchObject({
    hazardousSeconds: 1800,
    cautionSeconds: -1800,
    reducedHazards: [
      { label: "Thunderstorms", originalSeconds: 1800, candidateSeconds: 0 },
    ],
    newHazards: ["Rain"],
  });
});

test("rejects candidates that lose baseline coverage even when both are above 90 percent", () => {
  const intervals = [0, 300, 2400, 7200];
  const original = evaluate(
    ["hazardous", "favorable", "caution", "caution"],
    0,
    intervals,
  );
  const alternative = evaluate(
    ["unknown", "favorable", "favorable", "favorable"],
    3600,
    intervals,
  );
  expect(alternative.candidate.coverageFraction).toBeGreaterThan(0.9);
  expect(rankDepartures(original, [alternative])).toEqual([]);
  expect(comparisonEligibility(original, alternative)).toBe("reduced-coverage");
  expect(alternative.candidate.eligibility).toBe("eligible");
});

test("improvement must be meaningful and comparable to the baseline", () => {
  const original = evaluate(
    ["caution", "favorable", "favorable"],
    0,
    [0, 60, 5400],
  );
  const candidate = evaluate(
    ["favorable", "favorable", "favorable"],
    1800,
    [0, 60, 5400],
  );
  expect(rankDepartures(original, [candidate])).toEqual([]);
  expect(rankDepartures(candidate, [original])).toEqual([]);
  const missing = evaluate(["unknown", "favorable", "favorable"]);
  expect(rankDepartures(missing, [candidate])).toEqual([]);
  expect(
    rankDepartures(original, [candidate], {
      ...exposureDefaults,
      minimumScoreImprovement: 0.1,
    }),
  ).toHaveLength(1);
});

test("deduplicates equivalent outcomes and breaks symmetric ties toward the earlier slot", () => {
  const caseA = evaluate(["hazardous", "hazardous", "hazardous"]);
  const outcomes = [3600, -1800, 1800].map((offset) =>
    evaluate(["favorable", "favorable", "favorable"], offset),
  );
  expect(
    rankDepartures(caseA, outcomes).map(({ offsetSeconds }) => offsetSeconds),
  ).toEqual([-1800]);
  const mixed = [
    evaluate(["caution", "favorable", "favorable"], -3600),
    evaluate(["favorable", "favorable", "caution"], 3600),
    evaluate(["hazardous", "favorable", "favorable"], 5400),
  ];
  expect(
    rankDepartures(caseA, [...outcomes, ...mixed]).length,
  ).toBeLessThanOrEqual(3);
});
