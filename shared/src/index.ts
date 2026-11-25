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
