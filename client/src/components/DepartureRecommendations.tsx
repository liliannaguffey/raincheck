import type {
  DepartureCandidate,
  DepartureFlexibility,
  DepartureRecommendation,
  DepartureResponse,
  RouteResponse,
  WeatherSeverity,
} from "@raincheck/shared";
import { Clock } from "lucide-react";
import { useState } from "react";
import { defaultFlexibility } from "../departures/useDepartures";
import type { useDepartures } from "../departures/useDepartures";
import { formatArrival, formatDuration } from "../trips/routes";
import {
  severityOrder,
  severityPresentation,
} from "../weather/severityPresentation";
import { Button, Card } from "./ui";

const windowChoices = [0, 1, 2, 3, 6] as const;
const distinctions = {
  "best-overall": "Best alternative",
  "best-earlier": "Best earlier departure",
  "best-later": "Best later departure",
  alternative: "Another option",
};

function exposureTime(seconds: number) {
  return seconds > 0 && seconds < 60 ? "< 1 min" : formatDuration(seconds);
}

function ExposureBar({ candidate }: { candidate: DepartureCandidate }) {
  return (
    <div className="mt-3">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-canvas"
        aria-hidden="true"
      >
        {severityOrder.map((severity) => (
          <span
            key={severity}
            style={{
              background: severityPresentation[severity].color,
              width: `${candidate.durationSeconds ? (candidate.exposure[severity] / candidate.durationSeconds) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {severityOrder.map((severity) => (
          <div key={severity}>
            <dt className="text-muted">
              {severityPresentation[severity].label}
            </dt>
            <dd className="font-medium">
              {exposureTime(candidate.exposure[severity])}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        {Math.round(candidate.coverageFraction * 100)}% forecast coverage by
        driving time
        {candidate.score !== null && (
          <> · Exposure score {candidate.score.toFixed(1)} / 100</>
        )}
      </p>
    </div>
  );
}

function messageFor(result?: DepartureResponse) {
  switch (result?.status) {
    case "no-flexibility":
      return "Departure flexibility is turned off.";
    case "no-future-candidates":
      return "There are no future alternatives in this departure window.";
    case "insufficient-coverage":
      return `At least ${Math.round(result.minimumCoverage * 100)}% classified driving time and comparable coverage are needed. Some arrivals may be outside the forecast horizon.`;
    case "weather-unavailable":
      return "Weather forecasts are temporarily unavailable for departure comparisons.";
    case "no-improvement":
      return "No meaningful weather improvement was found in this window. Keep the original departure for this comparison.";
  }
}

function timeChange(
  seconds: number,
  severity: Extract<WeatherSeverity, "caution" | "hazardous">,
) {
  if (!seconds) return `No change in ${severity} exposure.`;
  return `${exposureTime(Math.abs(seconds))} ${seconds > 0 ? "less" : "more"} ${severity} exposure.`;
}

export function DepartureRecommendations({
  route,
  comparison,
  weatherPending,
  preview,
  applied,
  onPreview,
  onApply,
  onRestore,
}: {
  route: RouteResponse;
  comparison: ReturnType<typeof useDepartures>;
  weatherPending: boolean;
  preview?: DepartureRecommendation;
  applied?: DepartureRecommendation;
  onPreview: (candidate: DepartureRecommendation) => void;
  onApply: () => void;
  onRestore: () => void;
}) {
  const [settings, setSettings] =
    useState<DepartureFlexibility>(defaultFlexibility);
  const dirty =
    settings.hours !== comparison.settings.hours ||
    settings.direction !== comparison.settings.direction;
  const response = !dirty ? comparison.response : undefined;
  const blocked =
    !settings.hours ||
    weatherPending ||
    (!dirty && (comparison.pending || !!response));
  const baseline = response?.baseline;
  const originZone = route.samples[0]?.timeZone;
  const destinationZone = route.samples.at(-1)?.timeZone;
  const baselineMessage =
    settings.hours === 0
      ? "Departure flexibility is turned off."
      : dirty
        ? "Compare departures to use your updated settings."
        : messageFor(response);

  return (
    <section aria-labelledby="departure-recommendations" className="mt-6">
      <Card>
        <h2
          id="departure-recommendations"
          className="section-title flex items-center gap-2"
        >
          <Clock size={21} aria-hidden="true" className="text-accent" /> Find a
          better time to leave
        </h2>
        <p className="mt-2 text-sm text-muted">
          Comparisons use the same route and driving time. Traffic and forecasts
          can change. The exposure score measures estimated weather exposure on
          a 0–100 scale, with lower values indicating less exposure.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!blocked) comparison.compare(settings);
          }}
        >
          <label className="grid gap-1 text-sm font-semibold">
            Departure flexibility
            <select
              className="min-h-11 rounded-lg border border-slate-500 bg-white px-3"
              value={settings.hours}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  hours:
                    windowChoices.find(
                      (value) => String(value) === event.target.value,
                    ) ?? 3,
                })
              }
            >
              {windowChoices.map((value) => (
                <option key={value} value={value}>
                  {value
                    ? `Within ${value} ${value === 1 ? "hour" : "hours"}`
                    : "No flexibility"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Departure direction
            <select
              className="min-h-11 rounded-lg border border-slate-500 bg-white px-3"
              value={settings.direction}
              disabled={!settings.hours}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  direction: event.target
                    .value as DepartureFlexibility["direction"],
                })
              }
            >
              <option value="either">Earlier or later</option>
              <option value="earlier">Earlier only</option>
              <option value="later">Later only</option>
            </select>
          </label>
          <Button type="submit" tone="secondary" disabled={blocked}>
            Compare departures
          </Button>
        </form>
        {(preview || applied) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-teal-50 p-3">
            <p className="flex-1 text-sm font-semibold" role="status">
              {preview
                ? "Previewing an alternative departure"
                : "Alternative departure applied"}
            </p>
            {preview && <Button onClick={onApply}>Apply alternative</Button>}
            <Button tone="secondary" onClick={onRestore}>
              Return to original
            </Button>
          </div>
        )}
        {!dirty &&
          (comparison.pending || weatherPending) &&
          settings.hours > 0 && (
            <p className="mt-4 text-sm text-muted" role="status">
              Comparing departure times…
            </p>
          )}
        {!dirty && comparison.error && settings.hours > 0 && (
          <p className="mt-4 text-sm text-ink" role="alert">
            {comparison.error}
          </p>
        )}
        {baselineMessage && (
          <p className="mt-4 text-sm text-ink" role="status">
            {baselineMessage}
          </p>
        )}
        {response && (
          <p className="mt-3 text-sm text-muted">
            Compared {response.evaluatedCount} departure{" "}
            {response.evaluatedCount === 1 ? "time" : "times"} using{" "}
            {response.resolutionSeconds / 3600}-hour forecast slots. Equivalent
            hazard and exposure outcomes are grouped.
          </p>
        )}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-line bg-canvas p-4">
            <h3 className="font-semibold">Original departure</h3>
            <p className="text-sm">
              <time dateTime={route.departureUtc}>
                {formatArrival(route.departureUtc, originZone)}
              </time>
            </p>
            <p className="text-sm text-muted">
              Estimated arrival{" "}
              <time dateTime={route.arrivalUtc}>
                {formatArrival(route.arrivalUtc, destinationZone)}
              </time>
            </p>
            {baseline && <ExposureBar candidate={baseline} />}
          </article>
          {response?.recommendations.map((candidate) => (
            <article
              key={candidate.id}
              className="rounded-xl border border-line bg-white p-4"
            >
              <h3 className="font-semibold">
                {distinctions[candidate.distinction]}
              </h3>
              <p className="text-sm">
                <time dateTime={candidate.departureUtc}>
                  {formatArrival(
                    candidate.departureUtc,
                    candidate.originTimeZone,
                  )}
                </time>
                {" · "}
                {formatDuration(Math.abs(candidate.offsetSeconds))}{" "}
                {candidate.offsetSeconds < 0 ? "earlier" : "later"}
              </p>
              <p className="text-sm text-muted">
                Estimated arrival{" "}
                <time dateTime={candidate.arrivalUtc}>
                  {formatArrival(
                    candidate.arrivalUtc,
                    candidate.destinationTimeZone,
                  )}
                </time>
              </p>
              <ExposureBar candidate={candidate} />
              <ul className="mt-3 space-y-1 text-sm text-muted">
                <li>
                  {timeChange(
                    candidate.improvement.hazardousSeconds,
                    "hazardous",
                  )}
                </li>
                <li>
                  {timeChange(candidate.improvement.cautionSeconds, "caution")}
                </li>
                <li>
                  {Math.abs(candidate.improvement.scorePoints).toFixed(1)}{" "}
                  exposure-score points{" "}
                  {candidate.improvement.scorePoints < 0 ? "higher" : "lower"}{" "}
                  on comparable sections.
                </li>
                {candidate.improvement.reducedHazards.map((hazard) => (
                  <li key={hazard.label}>
                    {hazard.label} exposure changes from{" "}
                    {exposureTime(hazard.originalSeconds)} to{" "}
                    {exposureTime(hazard.candidateSeconds)}.
                  </li>
                ))}
                {candidate.improvement.newHazards.length > 0 && (
                  <li>
                    New hazards in this forecast include{" "}
                    {candidate.improvement.newHazards.join(", ")}.
                  </li>
                )}
              </ul>
              <Button
                tone="secondary"
                className="mt-3"
                aria-pressed={(preview ?? applied)?.id === candidate.id}
                onClick={() => onPreview(candidate)}
              >
                Preview departure
              </Button>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
