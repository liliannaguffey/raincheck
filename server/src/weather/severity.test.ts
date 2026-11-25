import type { Forecast } from "@raincheck/shared";
import { expect, test } from "vitest";
import { classifyWeather, severityThresholds } from "./severity.ts";

const fair: Forecast = {
  timestampUtc: "2030-01-02T00:00:00Z",
  conditionId: 800,
  windMetersPerSecond: 3,
  visibilityMeters: 10000,
};
const classify = (forecast: Partial<Forecast>, interval = 10800) =>
  classifyWeather(
    { status: "available", forecast: { ...fair, ...forecast } },
    interval,
  );

test("keeps clear cold weather favorable and does not classify from probability alone", () => {
  expect(
    classify({ temperatureC: -5, precipitationProbability: 0.95 }),
  ).toMatchObject({ severity: "favorable", hazards: [] });
});
test.each([
  [{ conditionId: 500 }, "caution", "Light rain or drizzle"],
  [{ conditionId: 501 }, "caution", "Moderate rain"],
  [{ conditionId: 502 }, "hazardous", "Heavy rain"],
  [{ conditionId: 504 }, "hazardous", "Significant rainfall"],
  [{ conditionId: 600 }, "caution", "Snow"],
  [{ conditionId: 602 }, "hazardous", "Heavy snow"],
  [{ conditionId: 511 }, "hazardous", "Freezing precipitation"],
  [{ conditionId: 611 }, "hazardous", "Freezing precipitation"],
  [
    { conditionId: 500, temperatureC: 1 },
    "caution",
    "Potential freezing conditions",
  ],
  [{ conditionId: 211 }, "hazardous", "Thunderstorms"],
  [{ conditionId: 212 }, "hazardous", "Thunderstorms with stronger activity"],
  [{ conditionId: 741, visibilityMeters: undefined }, "caution", "Fog"],
  [{ visibilityMeters: 402 }, "hazardous", "Reduced visibility"],
  [{ visibilityMeters: 403 }, "caution", "Reduced visibility"],
  [{ windMetersPerSecond: 17.9 }, "hazardous", "Strong sustained wind"],
  [{ windMetersPerSecond: 17.89 }, "caution", "Sustained wind"],
  [{ gustMetersPerSecond: 20.6 }, "hazardous", "Strong wind gusts"],
  [{ gustMetersPerSecond: 20.59 }, "caution", "Wind gusts"],
])("classifies %j as %s with the named hazard", (forecast, severity, label) => {
  expect(classify(forecast)).toMatchObject({
    severity,
    hazards: expect.arrayContaining([expect.objectContaining({ label })]),
  });
});
test("converts represented accumulations to average hourly rates", () => {
  expect(classify({ rainMm: 7.6 }, 3600).hazards[0]).toMatchObject({
    severity: "hazardous",
    measurement: { value: 7.6, threshold: 7.6 },
  });
  expect(classify({ rainMm: 7.6 }, 10800).hazards[0]).toMatchObject({
    severity: "caution",
    label: "Moderate rain",
  });
  expect(classify({ rainMm: 22.79 }).severity).toBe("caution");
  expect(classify({ snowMm: 7.5 }).hazards[0]).toMatchObject({
    severity: "hazardous",
    measurement: { value: 2.5 },
  });
});
test("retains concurrent hazards and uses the highest severity", () => {
  const result = classify({
    conditionId: 212,
    rainMm: 25,
    visibilityMeters: 200,
    gustMetersPerSecond: 25,
  });
  expect(result.severity).toBe("hazardous");
  expect(result.hazards.map(({ id }) => id)).toEqual([
    "rain",
    "visibility",
    "thunderstorm",
    "gust",
  ]);
});
test("reports incomplete and invalid data without treating it as favorable", () => {
  expect(classifyWeather({ status: "outside-range" }, 10800)).toMatchObject({
    severity: "unknown",
    completeness: "unavailable",
  });
  expect(
    classify({ visibilityMeters: -1, windMetersPerSecond: NaN }),
  ).toMatchObject({
    severity: "unknown",
    hazards: [],
    completeness: "limited",
  });
  expect(
    classify({ conditionId: 502, visibilityMeters: undefined }),
  ).toMatchObject({ severity: "hazardous", completeness: "limited" });
});
test("accepts alternate threshold configuration", () => {
  expect(
    classifyWeather(
      { status: "available", forecast: { ...fair, windMetersPerSecond: 12 } },
      10800,
      { ...severityThresholds, cautionWindMps: 13 },
    ).severity,
  ).toBe("favorable");
});
