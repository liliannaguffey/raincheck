import type {
  RouteHazardSection,
  RouteSample,
  RouteWeatherSummary as Summary,
} from "@raincheck/shared";
import { formatArrival, formatDuration, formatMiles } from "../trips/routes";
import {
  hazardMeasurement,
  severityOrder,
  severityPresentation,
} from "../weather/severityPresentation";
import { Button, Card } from "./ui";

export function RouteWeatherSummary({
  summary,
  advisories,
}: {
  summary: Summary;
  advisories: RouteHazardSection[];
}) {
  const distance = Object.values(summary.bySeverity).reduce(
    (total, item) => total + item.meters,
    0,
  );
  const hazards = [...new Set(advisories.map(({ hazard }) => hazard.label))];
  const coverage = summary.coverageFraction;
  return (
    <section aria-labelledby="route-weather-summary" className="mt-6">
      <Card>
        <h2 className="section-title" id="route-weather-summary">
          Weather summary
        </h2>
        <p
          className="mt-2 text-sm font-semibold"
          style={{ color: severityPresentation[summary.severity].color }}
        >
          {severityPresentation[summary.severity].label}
        </p>
        {coverage !== null && coverage < 1 && (
          <p className="mt-2 text-sm font-medium text-ink">
            Forecast classification is incomplete along this route.
          </p>
        )}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Forecast coverage by distance</dt>
            <dd className="font-semibold">
              {coverage === null
                ? "Unavailable"
                : `${Math.round(coverage * 100)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Caution sections</dt>
            <dd className="font-semibold">
              {summary.bySeverity.caution.sections}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Hazardous sections</dt>
            <dd className="font-semibold">
              {summary.bySeverity.hazardous.sections}
            </dd>
          </div>
          <div>
            <dt className="text-muted">
              Estimated time in caution or hazardous sections
            </dt>
            <dd className="font-semibold">
              {coverage
                ? formatDuration(summary.exposureSeconds)
                : "Unavailable"}
            </dd>
          </div>
        </dl>
        {hazards.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Identified hazards include {hazards.join(", ")}.
          </p>
        )}
        <ul
          aria-label="Estimated severity by distance"
          className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted"
        >
          {severityOrder.map((severity) => (
            <li key={severity}>
              {severityPresentation[severity].label} ·{" "}
              {distance
                ? `${Math.round((summary.bySeverity[severity].meters / distance) * 100)}%`
                : "—"}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function location(sample: RouteSample) {
  return sample.name ?? `${formatMiles(sample.distanceMeters)} into the drive`;
}

export function HazardAdvisories({
  advisories,
  selected,
  onSelect,
  filtered = false,
}: {
  advisories: RouteHazardSection[];
  selected?: string;
  onSelect: (advisory: RouteHazardSection) => void;
  filtered?: boolean;
}) {
  return (
    <section aria-labelledby="weather-advisories" className="mt-6">
      <Card>
        <h2 className="section-title" id="weather-advisories">
          RainCheck weather advisories
        </h2>
        <p className="mt-2 text-sm text-muted">
          These advisories use forecast estimates. Check{" "}
          <a className="underline" href="https://www.weather.gov/">
            official weather advisories
          </a>{" "}
          and local road reports before traveling.
        </p>
        {!advisories.length && (
          <p className="mt-3 text-sm text-ink">
            {filtered
              ? "No advisories match the selected categories."
              : "No supported hazards were identified in the available forecasts."}
          </p>
        )}
        {advisories.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {advisories.map((advisory) => {
              const { hazard, start, end, id } = advisory;
              const value = hazardMeasurement(hazard.measurement);
              const exactlyOne = start.id === end.id;
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-start justify-between gap-2 py-3"
                >
                  <div>
                    <h3 className="font-semibold">{hazard.label}</h3>
                    <p
                      className="text-sm font-medium"
                      style={{
                        color: severityPresentation[hazard.severity].color,
                      }}
                    >
                      {severityPresentation[hazard.severity].label}
                    </p>
                    <p className="text-sm text-muted">
                      {location(start)}
                      {!exactlyOne && ` to ${location(end)}`}
                      {" · "}
                      <time dateTime={start.arrivalUtc}>
                        {formatArrival(start.arrivalUtc, start.timeZone)}
                      </time>
                      {!exactlyOne && (
                        <>
                          {" "}
                          to{" "}
                          <time dateTime={end.arrivalUtc}>
                            {formatArrival(end.arrivalUtc, end.timeZone)}
                          </time>
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {value && `${value} · `}
                      {hazard.explanation}
                    </p>
                  </div>
                  <Button
                    tone="quiet"
                    aria-pressed={selected === id}
                    onClick={() => onSelect(advisory)}
                  >
                    Highlight {hazard.label.toLowerCase()}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
