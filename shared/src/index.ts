export interface HealthResponse {
  status: "ok";
}

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

export interface RoutePlace {
  placeId: string;
  address: string;
  coordinate: RouteCoordinate;
}

export interface RouteRequest {
  origin: RoutePlace;
  destination: RoutePlace;
  waypoints: RoutePlace[];
  /** Local calendar date and clock time at the origin. */
  departureLocal: string;
}

export interface RouteSegment {
  coordinates: RouteCoordinate[];
  distanceMeters?: number;
  staticDurationSeconds?: number;
}

export interface RouteLeg {
  start: RouteCoordinate;
  end: RouteCoordinate;
  coordinates: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteSegment[];
}

export interface DrivingRoute {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  coordinates: RouteCoordinate[];
  legs: RouteLeg[];
  trafficAware: boolean;
}

export interface RouteSample {
  id: string;
  coordinate: RouteCoordinate;
  elapsedSeconds: number;
  distanceMeters: number;
  arrivalUtc: string;
  kind: "origin" | "intermediate" | "waypoint" | "destination";
  timeZone?: string;
  name?: string;
}

export interface RouteResponse {
  route: DrivingRoute;
  departureUtc: string;
  arrivalUtc: string;
  samples: RouteSample[];
  sampling: "step-duration" | "distance-fallback";
}

export interface RouteErrorResponse {
  error: { code: string; message: string };
}

export interface Forecast {
  timestampUtc: string;
  temperatureC?: number;
  feelsLikeC?: number;
  condition?: string;
  description?: string;
  conditionId?: number;
  iconId?: string;
  precipitationProbability?: number;
  rainMm?: number;
  snowMm?: number;
  windMetersPerSecond?: number;
  gustMetersPerSecond?: number;
  windDirectionDegrees?: number;
  visibilityMeters?: number;
  humidityPercent?: number;
  cloudPercent?: number;
}

export type WeatherFailureCode =
  | "WEATHER_NOT_CONFIGURED"
  | "WEATHER_ACCESS_DENIED"
  | "WEATHER_RATE_LIMIT"
  | "WEATHER_TIMEOUT"
  | "WEATHER_UNAVAILABLE"
  | "INVALID_WEATHER_RESPONSE";

export type RouteWeatherPoint = RouteSample & {
  classification?: WeatherClassification;
} & (
    | {
        status: "available";
        forecast: Forecast;
        offsetSeconds: number;
        retrievedAtUtc: string;
      }
    | { status: "outside-range" | "unavailable" }
    | { status: "failed"; code: WeatherFailureCode }
  );

export interface RouteWeatherRequest {
  samples: RouteSample[];
}

export interface RouteWeatherResponse {
  provider: "OpenWeather";
  resolutionSeconds: number;
  horizonSeconds: number;
  points: RouteWeatherPoint[];
}

export type WeatherSeverity = "favorable" | "caution" | "hazardous" | "unknown";
export type HazardCategory =
  "rain" | "snow-ice" | "visibility" | "thunderstorms" | "winds";

export interface WeatherHazard {
  id:
    | "rain"
    | "snow"
    | "freezing"
    | "visibility"
    | "thunderstorm"
    | "wind"
    | "gust";
  category: HazardCategory;
  severity: "caution" | "hazardous";
  label: string;
  explanation: string;
  measurement?: {
    value: number;
    unit: string;
    threshold?: number;
    comparison?: "at-least" | "at-most";
  };
}

export interface WeatherClassification {
  severity: WeatherSeverity;
  hazards: WeatherHazard[];
  availability: RouteWeatherPoint["status"];
  completeness: "sufficient" | "limited" | "unavailable";
  explanation: string;
}

export interface RouteWeatherSegment {
  id: string;
  coordinates: RouteCoordinate[];
  start: RouteSample;
  end: RouteSample;
  severity: WeatherSeverity;
  distanceMeters: number;
  durationSeconds: number;
  hazards: WeatherHazard[];
}

export interface RouteHazardSection {
  id: string;
  hazard: WeatherHazard;
  start: RouteSample;
  end: RouteSample;
  sampleIds: string[];
  segmentIds: string[];
}

export interface RouteWeatherSummary {
  severity: WeatherSeverity;
  bySeverity: Record<
    WeatherSeverity,
    { seconds: number; meters: number; sections: number }
  >;
  coverageFraction: number | null;
  exposureSeconds: number;
}

export interface RouteTerrainSample {
  sampleId: string;
  elevationMeters: number;
  resolutionMeters?: number;
}
