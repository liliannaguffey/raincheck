import type { RouteWeatherPoint } from "@raincheck/shared";
import { assessment } from "@raincheck/shared/route-weather";
import { severityPresentation } from "../weather/severityPresentation";
import { CloudSun } from "lucide-react";
import { formatArrival, formatMiles } from "../trips/routes";
import {
  describeWeather,
  forecastIcon,
  formatPrecipitation,
  formatTemperature,
  formatWind,
  pointName,
} from "../weather/presentation";
import type { useRouteWeather } from "../weather/useRouteWeather";
import { Button, Card } from "./ui";

function failureMessage(codes: string[]) {
  if (codes.includes("WEATHER_NOT_CONFIGURED"))
    return "Weather forecasts need an OpenWeather key on the server.";
  if (codes.includes("WEATHER_ACCESS_DENIED"))
    return "OpenWeather rejected access. Check that the key is active and has access to the 5 Day / 3 Hour Forecast.";
  if (codes.includes("WEATHER_RATE_LIMIT"))
    return "The weather request limit was reached. Wait a minute before retrying.";
  if (codes.length)
    return "Some weather requests failed. You can retry to recover missing forecasts.";
}

export function WeatherTimeline({
  weather,
  selected,
  onSelect,
  visiblePoints,
  filtered = false,
}: {
  weather: ReturnType<typeof useRouteWeather>;
  selected?: string;
  onSelect?: (id: string) => void;
  visiblePoints?: RouteWeatherPoint[];
  filtered?: boolean;
}) {
  const points = weather.data?.points ?? [];
  const displayed = visiblePoints ?? points;
  const available = points.filter(
    ({ status }) => status === "available",
  ).length;
  const outside = points.filter(
    ({ status }) => status === "outside-range",
  ).length;
  const failures = points.flatMap((point) =>
    point.status === "failed" ? [point.code] : [],
  );
  const failure = weather.error ?? failureMessage(failures);
  const canRetry =
    weather.error ||
    failures.some(
      (code) =>
        code !== "WEATHER_NOT_CONFIGURED" && code !== "WEATHER_ACCESS_DENIED",
    );

  return (
    <section aria-labelledby="weather-timeline-title" className="mt-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="weather-timeline-title"
              className="section-title flex items-center gap-2"
            >
              <CloudSun size={21} aria-hidden="true" className="text-accent" />{" "}
              Route weather
            </h2>
            {weather.data && (
              <p className="mt-2 text-sm text-muted">
                Forecasts from{" "}
                <a
                  className="font-semibold text-accent underline"
                  href="https://openweathermap.org/"
                >
                  OpenWeather
                </a>{" "}
                in {weather.data.resolutionSeconds / 3600}-hour intervals.
                Arrival times use the location’s time zone where available.
                Predictions can change.
              </p>
            )}
          </div>
          {canRetry && (
            <Button
              tone="secondary"
              disabled={weather.pending}
              onClick={weather.retry}
            >
              Retry weather
            </Button>
          )}
        </div>
        {weather.pending && (
          <p className="mt-4 text-sm text-muted" role="status">
            Loading weather for your route…
          </p>
        )}
        {failure && (
          <p className="mt-4 text-sm text-ink" role="alert">
            {failure}
          </p>
        )}
        {points.length > 0 && (
          <>
            <div className="mt-4 space-y-1 text-sm text-muted">
              {available > 0 && available < points.length && (
                <p>Forecasts are available for only part of this route.</p>
              )}
              {outside > 0 && (
                <p>
                  {outside === points.length
                    ? "Weather forecasts are outside the available time range for this trip. Check again closer to departure."
                    : "Some arrival times fall outside the available forecast range."}
                </p>
              )}
              {available === 0 && outside < points.length && !failure && (
                <p>No matching forecasts are available for this trip.</p>
              )}
            </div>
            {filtered && (
              <p className="mt-3 text-sm text-muted" role="status">
                {displayed.length
                  ? `Showing ${displayed.length} of ${points.length} weather points with selected hazards.`
                  : "No timeline points match the selected categories."}
              </p>
            )}
            <ol className="mt-4 divide-y divide-line border-t border-line">
              {displayed.map((point) => {
                const forecast =
                  point.status === "available" ? point.forecast : undefined;
                const { Icon } = forecastIcon(forecast);
                const name = pointName(point);
                const condition = assessment(point);
                const severity = severityPresentation[condition.severity];
                return (
                  <li
                    key={point.id}
                    className={selected === point.id ? "bg-teal-50" : undefined}
                  >
                    <div className="flex flex-wrap items-start gap-3 px-2 py-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-accent">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-semibold">
                          {name}
                        </h3>
                        <p className="text-sm text-muted">
                          Arrival{" "}
                          <time dateTime={point.arrivalUtc}>
                            {formatArrival(point.arrivalUtc, point.timeZone)}
                          </time>
                          {" · "}
                          {formatMiles(point.distanceMeters)}
                        </p>
                        <p className="mt-1 text-sm font-medium capitalize">
                          {describeWeather(point)}
                          {forecast?.temperatureC !== undefined &&
                            ` · ${formatTemperature(forecast.temperatureC)}`}
                        </p>
                        <p
                          className="mt-1 text-sm font-semibold"
                          style={{ color: severity.color }}
                        >
                          {severity.label}
                        </p>
                        {condition.hazards.length > 0 && (
                          <ul className="mt-1 space-y-1 text-sm text-muted">
                            {condition.hazards.map((hazard) => (
                              <li key={hazard.id}>
                                <strong>{hazard.label}.</strong>{" "}
                                {hazard.explanation}
                              </li>
                            ))}
                          </ul>
                        )}
                        {forecast && (
                          <div className="mt-1 space-y-1 text-sm text-muted">
                            <p>
                              Forecast{" "}
                              <time dateTime={forecast.timestampUtc}>
                                {formatArrival(
                                  forecast.timestampUtc,
                                  point.timeZone,
                                )}
                              </time>
                            </p>
                            <p className="flex flex-wrap gap-x-4">
                              {forecast.precipitationProbability !==
                                undefined && (
                                <span>
                                  Precipitation{" "}
                                  {formatPrecipitation(
                                    forecast.precipitationProbability,
                                  )}
                                </span>
                              )}
                              {forecast.windMetersPerSecond !== undefined && (
                                <span>
                                  Wind{" "}
                                  {formatWind(forecast.windMetersPerSecond)}
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      {onSelect && (
                        <Button
                          tone="quiet"
                          aria-label={`Show weather on map for ${name}`}
                          aria-pressed={selected === point.id}
                          onClick={() => onSelect(point.id)}
                        >
                          Show on map
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Card>
    </section>
  );
}
