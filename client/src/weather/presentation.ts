import type { Forecast, RouteWeatherPoint } from "@raincheck/shared";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CircleHelp,
  Sun,
} from "lucide-react";
import { formatDuration } from "../trips/routes";

export function forecastIcon(forecast?: Forecast) {
  switch (forecast?.iconId?.slice(0, 2)) {
    case "01":
      return { Icon: Sun, glyph: "☀" };
    case "02":
      return { Icon: CloudSun, glyph: "🌤" };
    case "03":
    case "04":
      return { Icon: Cloud, glyph: "☁" };
    case "09":
      return { Icon: CloudDrizzle, glyph: "🌦" };
    case "10":
      return { Icon: CloudRain, glyph: "🌧" };
    case "11":
      return { Icon: CloudLightning, glyph: "⛈" };
    case "13":
      return { Icon: CloudSnow, glyph: "🌨" };
    case "50":
      return { Icon: CloudFog, glyph: "🌫" };
    default:
      return { Icon: CircleHelp, glyph: "?" };
  }
}

export function pointName(point: RouteWeatherPoint) {
  return (
    point.name ??
    (point.kind === "origin"
      ? "Origin"
      : point.kind === "destination"
        ? "Destination"
        : point.kind === "waypoint"
          ? `Stop after ${formatDuration(point.elapsedSeconds)}`
          : `Along the route · ${formatDuration(point.elapsedSeconds)} into drive`)
  );
}

export function describeWeather(point: RouteWeatherPoint) {
  switch (point.status) {
    case "available":
      return (
        point.forecast.description ||
        point.forecast.condition ||
        "Condition unavailable"
      );
    case "outside-range":
      return "Outside forecast coverage";
    case "unavailable":
      return "No forecast available";
    case "failed":
      return "Forecast request failed";
  }
}

export const formatTemperature = (celsius: number) =>
  `${Math.round((celsius * 9) / 5 + 32)} °F`;
export const formatWind = (metersPerSecond: number) =>
  `${Math.round(metersPerSecond / 0.44704)} mph`;
export const formatPrecipitation = (probability: number) =>
  `${Math.round(probability * 100)}%`;
