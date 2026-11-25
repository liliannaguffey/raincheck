import type {
  DrivingRoute,
  RouteCoordinate,
  RouteLeg,
  RouteRequest,
} from "@raincheck/shared";
import { RouteError } from "./errors.ts";
import { decodePolyline, isCoordinate } from "./geometry.ts";

type Polyline = { encodedPolyline?: string };
type Location = { latLng?: { latitude?: number; longitude?: number } };
interface GoogleLeg {
  distanceMeters?: number;
  duration?: string;
  polyline?: Polyline;
  startLocation?: Location;
  endLocation?: Location;
  steps?: {
    distanceMeters?: number;
    staticDuration?: string;
    polyline?: Polyline;
  }[];
}

interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  polyline?: Polyline;
  legs?: GoogleLeg[];
}

const fields = [
  "distanceMeters",
  "duration",
  "polyline.encodedPolyline",
  "legs.distanceMeters",
  "legs.duration",
  "legs.polyline.encodedPolyline",
  "legs.startLocation.latLng",
  "legs.endLocation.latLng",
  "legs.steps.distanceMeters",
  "legs.steps.staticDuration",
  "legs.steps.polyline.encodedPolyline",
]
  .map((field) => `routes.${field}`)
  .join(",");

const invalidResponse = () =>
  new RouteError(
    502,
    "INVALID_PROVIDER_RESPONSE",
    "Google Maps returned incomplete route or time zone data.",
  );
const rateLimit = () =>
  new RouteError(
    429,
    "ROUTE_RATE_LIMIT",
    "Google Maps is temporarily rate limited. Try again later.",
  );
const noRoute = () =>
  new RouteError(
    422,
    "NO_ROUTE",
    "No driving route was found for those locations.",
  );

function seconds(value?: string) {
  return typeof value === "string" && /^\d+(?:\.\d{1,9})?s$/.test(value)
    ? Number(value.slice(0, -1))
    : undefined;
}

function meters(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function coordinate(location?: Location) {
  if (!location?.latLng || typeof location.latLng !== "object")
    throw invalidResponse();
  const { latitude = 0, longitude = 0 } = location.latLng;
  const point = { lat: latitude, lng: longitude };
  if (!isCoordinate(point)) throw invalidResponse();
  return point;
}

function normalize(data: GoogleRoute, legCount: number): DrivingRoute {
  const distanceMeters = meters(data.distanceMeters);
  const durationSeconds = seconds(data.duration);
  const encodedPolyline = data.polyline?.encodedPolyline;
  if (
    distanceMeters === undefined ||
    !durationSeconds ||
    !Number.isFinite(durationSeconds) ||
    typeof encodedPolyline !== "string" ||
    !Array.isArray(data.legs) ||
    data.legs.length !== legCount
  ) {
    throw invalidResponse();
  }

  const coordinates = decodePolyline(encodedPolyline);
  if (coordinates.length < 2) throw invalidResponse();

  const legs: RouteLeg[] = data.legs.map((leg) => {
    const start = coordinate(leg.startLocation);
    const end = coordinate(leg.endLocation);
    const durationSeconds = seconds(leg.duration);
    // Protobuf JSON can omit scalar zero values.
    const distanceMeters = meters(leg.distanceMeters ?? 0);
    if (
      distanceMeters === undefined ||
      !Number.isFinite(durationSeconds ?? NaN)
    )
      throw invalidResponse();

    const steps = (leg.steps ?? []).map((step) => ({
      coordinates: step.polyline?.encodedPolyline
        ? decodePolyline(step.polyline.encodedPolyline)
        : [],
      distanceMeters: meters(step.distanceMeters),
      staticDurationSeconds: seconds(step.staticDuration),
    }));
    const path = leg.polyline?.encodedPolyline
      ? decodePolyline(leg.polyline.encodedPolyline)
      : legCount === 1
        ? coordinates
        : steps.flatMap((step) => step.coordinates);
    if (!path.length && distanceMeters > 0) throw invalidResponse();

    return {
      start,
      end,
      coordinates: path.length ? path : [start, end],
      distanceMeters,
      durationSeconds: durationSeconds!,
      steps,
    };
  });

  return {
    coordinates,
    encodedPolyline,
    distanceMeters,
    durationSeconds,
    legs,
    trafficAware: true,
  };
}

export function googleMaps(key: string, fetcher: typeof fetch = fetch) {
  async function request(
    url: string | URL,
    signal: AbortSignal,
    options?: RequestInit,
  ) {
    let response: Response;
    try {
      response = await fetcher(url, {
        ...options,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
    } catch {
      signal.throwIfAborted();
      throw new RouteError(
        502,
        "PROVIDER_UNAVAILABLE",
        "Google Maps did not respond. Try again.",
      );
    }
    if (response.status === 429) throw rateLimit();
    if (response.status === 400 && options?.method === "POST") {
      throw new RouteError(
        422,
        "ROUTE_REJECTED",
        "Google Maps rejected the locations or departure. Check the trip details.",
      );
    }
    if (!response.ok) {
      throw new RouteError(
        502,
        "PROVIDER_UNAVAILABLE",
        "Google Maps could not complete the request.",
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      signal.throwIfAborted();
      throw invalidResponse();
    }
  }

  return {
    async timeZone(
      point: RouteCoordinate,
      timestamp: number,
      signal: AbortSignal,
    ): Promise<string> {
      const url = new URL("https://maps.googleapis.com/maps/api/timezone/json");
      url.search = new URLSearchParams({
        location: `${point.lat},${point.lng}`,
        timestamp: String(Math.floor(timestamp / 1000)),
        key,
      }).toString();
      const data = (await request(url, signal)) as {
        status?: string;
        timeZoneId?: string;
      } | null;
      if (data?.status === "OVER_QUERY_LIMIT") throw rateLimit();
      if (
        data?.status === "REQUEST_DENIED" ||
        data?.status === "UNKNOWN_ERROR"
      ) {
        throw new RouteError(
          502,
          "PROVIDER_UNAVAILABLE",
          "Google Maps could not resolve the time zone.",
        );
      }
      if (data?.status === "ZERO_RESULTS") {
        throw new RouteError(
          422,
          "TIME_ZONE_UNAVAILABLE",
          "The time zone could not be determined for this location.",
        );
      }
      if (data?.status !== "OK" || typeof data.timeZoneId !== "string")
        throw invalidResponse();
      try {
        new Intl.DateTimeFormat("en", { timeZone: data.timeZoneId });
      } catch {
        throw invalidResponse();
      }
      return data.timeZoneId;
    },

    async drive(
      trip: RouteRequest,
      departureTime: string,
      signal: AbortSignal,
    ) {
      const data = (await request(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        signal,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": fields,
          },
          body: JSON.stringify({
            origin: { placeId: trip.origin.placeId },
            destination: { placeId: trip.destination.placeId },
            intermediates: trip.waypoints.map(({ placeId }) => ({ placeId })),
            departureTime,
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
            polylineQuality: "HIGH_QUALITY",
          }),
        },
      )) as { routes?: GoogleRoute[] } | null;
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw invalidResponse();
      if (!data.routes && Object.keys(data).length === 0) throw noRoute();
      if (!Array.isArray(data.routes)) throw invalidResponse();
      if (!data.routes.length) throw noRoute();
      try {
        return normalize(data.routes[0]!, trip.waypoints.length + 1);
      } catch {
        throw invalidResponse();
      }
    },
  };
}
