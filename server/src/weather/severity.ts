import type {
  Forecast,
  RouteWeatherPoint,
  WeatherClassification,
  WeatherHazard,
} from "@raincheck/shared";

export const severityThresholds = Object.freeze({
  moderateRainMmPerHour: 2.5,
  heavyRainMmPerHour: 7.6,
  significantRainMmPerHour: 25,
  heavySnowMmPerHour: 2.5,
  cautionVisibilityMeters: 1609,
  hazardousVisibilityMeters: 402,
  cautionWindMps: 11.2,
  hazardousWindMps: 17.9,
  cautionGustMps: 15.6,
  hazardousGustMps: 20.6,
  nearFreezingC: 1,
});

type SeverityThresholds = { [Key in keyof typeof severityThresholds]: number };

function usable(value: number | undefined, min = 0) {
  return value !== undefined && Number.isFinite(value) && value >= min
    ? value
    : undefined;
}

export function classifyWeather(
  point: Pick<RouteWeatherPoint, "status"> & { forecast?: Forecast },
  accumulationSeconds: number,
  thresholds: Readonly<SeverityThresholds> = severityThresholds,
): WeatherClassification {
  const { forecast, status: availability } = point;
  if (availability !== "available" || !forecast) {
    return {
      availability,
      severity: "unknown",
      hazards: [],
      completeness: "unavailable",
      explanation: "Forecast data is unavailable for this arrival.",
    };
  }

  const t = thresholds;
  const hazards: WeatherHazard[] = [];
  const id = Number.isInteger(forecast.conditionId)
    ? forecast.conditionId!
    : -1;
  const words =
    `${forecast.condition ?? ""} ${forecast.description ?? ""}`.toLowerCase();
  const hasCode = (first: number, last: number) => id >= first && id <= last;
  const fallback = (pattern: RegExp) => id < 0 && pattern.test(words);
  const hours =
    Number.isFinite(accumulationSeconds) && accumulationSeconds > 0
      ? accumulationSeconds / 3600
      : Infinity;
  const rain = usable(forecast.rainMm);
  const snow = usable(forecast.snowMm);
  const rainRate =
    rain === undefined || !Number.isFinite(hours) ? undefined : rain / hours;
  const snowRate =
    snow === undefined || !Number.isFinite(hours) ? undefined : snow / hours;
  const temperature = usable(forecast.temperatureC, -100);
  const visibility = usable(forecast.visibilityMeters);
  const wind = usable(forecast.windMetersPerSecond);
  const gust = usable(forecast.gustMetersPerSecond);
  const probability = usable(forecast.precipitationProbability);
  const probabilityNote =
    probability !== undefined && probability <= 1
      ? ` Forecast precipitation probability is ${Math.round(probability * 100)}%.`
      : "";
  const rainPresent =
    hasCode(300, 321) ||
    hasCode(500, 531) ||
    (rain ?? 0) > 0 ||
    fallback(/\b(rain|drizzle)\b/);
  const snowPresent =
    hasCode(600, 622) || (snow ?? 0) > 0 || fallback(/\bsnow\b/);
  const explicitIce =
    id === 511 ||
    [611, 612, 613, 615, 616].includes(id) ||
    fallback(/freezing (rain|drizzle)|\bsleet\b/);

  if (rainPresent) {
    const rate = rainRate ?? 0;
    const significant =
      rate >= t.significantRainMmPerHour ||
      id === 503 ||
      id === 504 ||
      fallback(/very heavy rain|extreme rain/);
    const heavy =
      significant ||
      rate >= t.heavyRainMmPerHour ||
      [502, 522].includes(id) ||
      fallback(/heavy rain/);
    const moderate =
      rate >= t.moderateRainMmPerHour ||
      id === 501 ||
      fallback(/moderate rain/);
    const threshold =
      rate >= t.significantRainMmPerHour
        ? t.significantRainMmPerHour
        : rate >= t.heavyRainMmPerHour
          ? t.heavyRainMmPerHour
          : rate >= t.moderateRainMmPerHour
            ? t.moderateRainMmPerHour
            : undefined;
    hazards.push({
      id: "rain",
      category: "rain",
      severity: heavy ? "hazardous" : "caution",
      label: significant
        ? "Significant rainfall"
        : heavy
          ? "Heavy rain"
          : moderate
            ? "Moderate rain"
            : "Light rain or drizzle",
      explanation:
        (heavy
          ? "Rain may markedly reduce visibility and leave standing water."
          : "Rain may reduce traction.") + probabilityNote,
      measurement:
        rainRate === undefined
          ? undefined
          : {
              value: rainRate,
              unit: "mm/h average",
              threshold,
              comparison: "at-least",
            },
    });
  }

  if (snowPresent && (![611, 612, 613].includes(id) || (snow ?? 0) > 0)) {
    const heavy =
      (snowRate ?? 0) >= t.heavySnowMmPerHour ||
      [602, 622].includes(id) ||
      fallback(/heavy snow/);
    hazards.push({
      id: "snow",
      category: "snow-ice",
      severity: heavy ? "hazardous" : "caution",
      label: heavy ? "Heavy snow" : "Snow",
      explanation: "Snow may reduce traction and obscure road markings.",
      measurement:
        snowRate === undefined
          ? undefined
          : {
              value: snowRate,
              unit: "mm/h average",
              threshold:
                heavy && snowRate >= t.heavySnowMmPerHour
                  ? t.heavySnowMmPerHour
                  : undefined,
              comparison: "at-least",
            },
    });
  }

  if (
    explicitIce ||
    (rainPresent && temperature !== undefined && temperature <= t.nearFreezingC)
  ) {
    hazards.push({
      id: "freezing",
      category: "snow-ice",
      severity: explicitIce ? "hazardous" : "caution",
      label: explicitIce
        ? "Freezing precipitation"
        : "Potential freezing conditions",
      explanation: explicitIce
        ? "The forecast includes freezing or mixed precipitation that may reduce traction."
        : "Liquid precipitation is forecast near freezing. Road surface temperatures are unknown.",
      measurement:
        temperature === undefined
          ? undefined
          : {
              value: temperature,
              unit: "°C",
              threshold: explicitIce ? undefined : t.nearFreezingC,
              comparison: "at-most",
            },
    });
  }

  const obscuration =
    [701, 711, 721, 731, 741, 751, 761, 762].includes(id) ||
    fallback(/\b(fog|mist|haze|smoke|dust)\b/);
  if (
    obscuration ||
    (visibility !== undefined && visibility <= t.cautionVisibilityMeters)
  ) {
    const dense =
      visibility !== undefined && visibility <= t.hazardousVisibilityMeters;
    hazards.push({
      id: "visibility",
      category: "visibility",
      severity: dense ? "hazardous" : "caution",
      label: id === 741 || fallback(/\bfog\b/) ? "Fog" : "Reduced visibility",
      explanation: dense
        ? "Very limited forecast visibility may make hazards difficult to see."
        : "The forecast indicates obscuration or reduced visible distance.",
      measurement:
        visibility === undefined
          ? undefined
          : {
              value: visibility,
              unit: "m",
              threshold: dense
                ? t.hazardousVisibilityMeters
                : visibility <= t.cautionVisibilityMeters
                  ? t.cautionVisibilityMeters
                  : undefined,
              comparison: "at-most",
            },
    });
  }

  if (hasCode(200, 232) || fallback(/thunderstorm/)) {
    const stronger =
      [202, 212, 221, 232].includes(id) || fallback(/heavy thunderstorm/);
    hazards.push({
      id: "thunderstorm",
      category: "thunderstorms",
      severity: "hazardous",
      label: stronger
        ? "Thunderstorms with stronger activity"
        : "Thunderstorms",
      explanation:
        "Lightning, sudden downpours, or abrupt wind changes may occur near thunderstorms.",
    });
  }

  for (const item of [
    {
      id: "wind",
      value: wind,
      caution: t.cautionWindMps,
      hazard: t.hazardousWindMps,
      label: "Sustained wind",
    },
    {
      id: "gust",
      value: gust,
      caution: t.cautionGustMps,
      hazard: t.hazardousGustMps,
      label: "Wind gusts",
    },
  ] as const) {
    if (item.value === undefined || item.value < item.caution) continue;
    const strong = item.value >= item.hazard;
    hazards.push({
      id: item.id,
      category: "winds",
      severity: strong ? "hazardous" : "caution",
      label: strong ? `Strong ${item.label.toLowerCase()}` : item.label,
      explanation:
        "Wind can affect steering, especially on exposed roads and in high-profile vehicles.",
      measurement: {
        value: item.value,
        unit: "m/s",
        threshold: strong ? item.hazard : item.caution,
        comparison: "at-least",
      },
    });
  }

  const benign =
    hasCode(800, 804) ||
    fallback(
      /^\s*(clear( sky)?|clouds?|few clouds|scattered clouds|broken clouds|overcast clouds)(\s|$)/,
    );
  const sufficient =
    (benign ||
      hazards.some(({ id }) => !["wind", "gust", "visibility"].includes(id)) ||
      obscuration) &&
    wind !== undefined &&
    visibility !== undefined;
  const severity = hazards.some((hazard) => hazard.severity === "hazardous")
    ? "hazardous"
    : hazards.length
      ? "caution"
      : sufficient
        ? "favorable"
        : "unknown";

  return {
    availability,
    severity,
    hazards,
    completeness: sufficient ? "sufficient" : "limited",
    explanation: hazards.length
      ? "The highest identified hazard determines this classification."
      : severity === "favorable"
        ? "The available forecast shows no supported hazard at this sample."
        : "Forecast condition, wind, or visibility data is insufficient to classify this sample.",
  };
}

export function classifyPoint(
  point: RouteWeatherPoint,
  accumulationSeconds: number,
): RouteWeatherPoint {
  return {
    ...point,
    classification: classifyWeather(point, accumulationSeconds),
  };
}
