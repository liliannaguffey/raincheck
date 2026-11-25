import type { WeatherHazard, WeatherSeverity } from "@raincheck/shared";
import { formatMiles } from "../trips/routes";
import { formatTemperature, formatWind } from "./presentation";

export const severityPresentation: Record<
  WeatherSeverity,
  { label: string; color: string; symbol: string }
> = {
  favorable: { label: "Favorable forecast", color: "#15803d", symbol: "✓" },
  caution: { label: "Use caution", color: "#a16207", symbol: "!" },
  hazardous: { label: "Potentially hazardous", color: "#b91c1c", symbol: "▲" },
  unknown: {
    label: "Weather unavailable or insufficient",
    color: "#64748b",
    symbol: "?",
  },
};

export const severityOrder = [
  "favorable",
  "caution",
  "hazardous",
  "unknown",
] as const;

export function hazardMeasurement(measurement: WeatherHazard["measurement"]) {
  if (!measurement) return;
  const { value, unit } = measurement;
  if (unit === "m/s") return formatWind(value);
  if (unit === "m") return formatMiles(value);
  if (unit === "°C") return formatTemperature(value);
  return `${value.toFixed(1)} ${unit}`;
}
