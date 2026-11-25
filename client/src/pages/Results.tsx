import type { RouteRequest, RouteResponse } from "@raincheck/shared";
import { ArrowLeft, MapPin } from "lucide-react";
import { useLocation } from "react-router";
import { RouteMap } from "../components/RouteMap";
import { ActionLink, Card } from "../components/ui";
import { formatArrival, formatDuration, formatMiles } from "../trips/routes";

export function Results() {
  const { state } = useLocation();
  const planned = state as { trip: RouteRequest; result: RouteResponse } | null;

  if (!planned?.trip || !planned.result) {
    return (
      <section className="container-shell page-section">
        <h1 className="page-title">Trip results</h1>
        <p className="mt-2 text-muted">
          Start in the planner to calculate a driving route.
        </p>
        <ActionLink className="mt-5" to="/">
          Open trip planner
        </ActionLink>
      </section>
    );
  }

  const { trip, result } = planned;
  const { route, departureUtc, arrivalUtc, samples } = result;

  return (
    <section className="container-shell page-section">
      <ActionLink tone="quiet" to="/" state={{ trip }}>
        <ArrowLeft size={18} aria-hidden="true" /> Edit trip
      </ActionLink>
      <h1 className="page-title mt-3">Trip results</h1>
      <div className="mt-6 grid items-start gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <h2 className="section-title flex items-center gap-2">
            <MapPin size={20} className="text-accent" aria-hidden="true" /> Trip
            details
          </h2>
          <ol className="mt-4 space-y-3 break-words">
            {[trip.origin, ...trip.waypoints, trip.destination].map(
              (place, index) => (
                <li key={index} className="border-l-2 border-teal-300 pl-3">
                  <span className="block text-xs font-semibold text-muted">
                    {index === 0
                      ? "Start"
                      : index > trip.waypoints.length
                        ? "Destination"
                        : `Stop ${index}`}
                  </span>
                  {place.address}
                </li>
              ),
            )}
          </ol>
          <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-muted">Driving distance</dt>
              <dd className="font-medium">
                {formatMiles(route.distanceMeters)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">
                Estimated driving time
                {route.trafficAware ? " · Traffic-aware" : ""}
              </dt>
              <dd className="font-medium">
                {formatDuration(route.durationSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Departure</dt>
              <dd className="font-medium">
                <time dateTime={departureUtc}>
                  {formatArrival(departureUtc, samples[0]?.timeZone)}
                </time>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Estimated arrival</dt>
              <dd className="font-medium">
                <time dateTime={arrivalUtc}>
                  {formatArrival(arrivalUtc, samples.at(-1)?.timeZone)}
                </time>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted">
            Estimates exclude time spent at stops.
          </p>
          <p className="mt-2 text-xs font-medium text-muted" translate="no">
            Google Maps
          </p>
        </Card>
        <Card>
          <h2 className="section-title">Driving route</h2>
          <RouteMap result={result} />
          {result.sampling === "distance-fallback" && (
            <p className="mt-3 text-sm text-muted">
              Some points along this route use distance-based timing estimates.
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}
