import type { RouteRequest, RouteResponse } from "@raincheck/shared";
import { RouteError } from "./errors.ts";
import { googleMaps } from "./google.ts";
import { sampleRoute } from "./sampling.ts";
import { localDepartureToUtc } from "./time.ts";

export function createRouteService({
  key = process.env.GOOGLE_MAPS_SERVER_API_KEY,
  fetcher = fetch,
  now = Date.now,
}: { key?: string; fetcher?: typeof fetch; now?: () => number } = {}) {
  return async (
    trip: RouteRequest,
    signal: AbortSignal,
  ): Promise<RouteResponse> => {
    if (!key?.trim()) {
      throw new RouteError(
        503,
        "MAPS_NOT_CONFIGURED",
        "Route planning needs a Google Maps server key.",
      );
    }

    const google = googleMaps(key.trim(), fetcher);
    const originZone = await google.timeZone(
      trip.origin.coordinate,
      now(),
      signal,
    );
    let departureUtc: string;
    try {
      departureUtc = localDepartureToUtc(trip.departureLocal, originZone);
    } catch {
      throw new RouteError(
        422,
        "INVALID_DEPARTURE",
        "Choose a valid, unambiguous departure time in the starting location’s time zone.",
      );
    }
    if (Date.parse(departureUtc) <= now()) {
      throw new RouteError(
        422,
        "INVALID_DEPARTURE",
        "Choose a future departure time in the starting location’s time zone.",
      );
    }

    const route = await google.drive(trip, departureUtc, signal);
    const places = [trip.origin, ...trip.waypoints, trip.destination];
    let result: ReturnType<typeof sampleRoute>;
    try {
      result = sampleRoute(
        route,
        departureUtc,
        places.map(({ address }) => ({ name: address })),
      );
    } catch {
      throw new RouteError(
        502,
        "INVALID_PROVIDER_RESPONSE",
        "Google Maps returned route data that could not be sampled.",
      );
    }

    result.samples[0]!.timeZone = originZone;
    const zoneLookups = new Map<string, Promise<string | undefined>>();
    const { lat, lng } = trip.origin.coordinate;
    zoneLookups.set(`${lat},${lng}`, Promise.resolve(originZone));
    await Promise.all(
      result.samples.map(async (sample) => {
        if (sample.kind === "origin" || sample.kind === "intermediate") return;
        const { lat, lng } = sample.coordinate;
        const key = `${lat},${lng}`;
        let zone = zoneLookups.get(key);
        if (!zone) {
          zone = google
            .timeZone(sample.coordinate, Date.parse(sample.arrivalUtc), signal)
            .catch(() => {
              signal.throwIfAborted();
              return undefined;
            });
          zoneLookups.set(key, zone);
        }
        sample.timeZone = await zone;
      }),
    );

    return {
      route,
      departureUtc,
      arrivalUtc: result.samples.at(-1)!.arrivalUtc,
      ...result,
    };
  };
}

export type RouteService = ReturnType<typeof createRouteService>;
