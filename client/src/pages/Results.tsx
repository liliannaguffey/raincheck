import { ArrowLeft, Clock, CloudSun, MapPin } from "lucide-react";
import { useLocation } from "react-router";
import { ActionLink, Card } from "../components/ui";
import type { TripPreview } from "../trips/preview";

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function Results() {
  const { state } = useLocation();
  const preview = (state as { preview?: TripPreview } | null)?.preview;

  if (!preview) {
    return (
      <section className="container-shell page-section">
        <h1 className="page-title">Trip results</h1>
        <p className="mt-2 text-muted">
          Start in the planner to preview a trip.
        </p>
        <ActionLink className="mt-5" to="/">
          Open trip planner
        </ActionLink>
      </section>
    );
  }

  const { trip, forecasts } = preview;
  const departure = new Date(trip.departureUtc);

  return (
    <section className="container-shell page-section">
      <ActionLink tone="quiet" to="/" state={{ trip }}>
        <ArrowLeft size={18} aria-hidden="true" /> Edit trip
      </ActionLink>
      <h1 className="page-title mt-3">Trip results</h1>
      <p className="mt-3 rounded-xl border border-line bg-teal-50 p-4 text-sm text-ink">
        <strong>Sample weather data.</strong> These conditions are illustrative
        and don’t depend on your route or departure.
      </p>
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
                  {place}
                </li>
              ),
            )}
          </ol>
          <p className="mt-5 flex items-center gap-2 text-sm text-muted">
            <Clock size={17} className="shrink-0" aria-hidden="true" />
            Departure{" "}
            <time dateTime={trip.departureUtc}>
              {dateTime.format(departure)}
            </time>
          </p>
        </Card>
        <Card>
          <h2 className="section-title flex items-center gap-2">
            <CloudSun size={21} className="text-accent" aria-hidden="true" />{" "}
            Sample weather timeline
          </h2>
          <p className="mt-2 text-sm text-muted">
            Illustrative times in your device’s time zone.
          </p>
          <ol className="mt-4 divide-y divide-line">
            {forecasts.map(({ elapsedMinutes, condition, temperatureF }) => {
              const time = new Date(
                departure.getTime() + elapsedMinutes * 60_000,
              );
              return (
                <li
                  key={elapsedMinutes}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <time
                      dateTime={time.toISOString()}
                      className="block text-sm text-muted"
                    >
                      {dateTime.format(time)}
                    </time>
                    <span className="font-medium">{condition}</span>
                  </div>
                  <span className="font-semibold">{temperatureF} °F</span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </section>
  );
}
