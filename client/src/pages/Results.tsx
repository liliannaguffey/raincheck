import type {
  DepartureRecommendation,
  RouteWeatherResponse,
  HazardCategory,
  RouteHazardSection,
  RouteRequest,
  RouteResponse,
} from "@raincheck/shared";
import { ArrowLeft, MapPin } from "lucide-react";
import {
  assessment,
  groupRouteHazards,
  segmentRouteWeather,
  summarizeRouteWeather,
} from "@raincheck/shared/route-weather";
import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { DepartureRecommendations } from "../components/DepartureRecommendations";
import { useDepartures } from "../departures/useDepartures";
import { WeatherFilters } from "../components/WeatherFilters";
import { WeatherTimeline } from "../components/WeatherTimeline";
import { useRouteWeather } from "../weather/useRouteWeather";
import {
  HazardAdvisories,
  RouteWeatherSummary,
} from "../components/RouteWeatherSummary";
import { SeverityLegend } from "../components/SeverityLegend";
import { RouteMap } from "../components/RouteMap";
import { ActionLink, Card } from "../components/ui";
import { formatArrival, formatDuration, formatMiles } from "../trips/routes";

export function Results() {
  const { state, key } = useLocation();
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

  return <TripResults key={key} {...planned} />;
}

interface DepartureSnapshot {
  candidate: DepartureRecommendation;
  weather: RouteWeatherResponse;
}

function TripResults({
  trip,
  result,
}: {
  trip: RouteRequest;
  result: RouteResponse;
}) {
  const originalWeather = useRouteWeather(result.samples);
  const comparison = useDepartures(result, !originalWeather.pending);
  const [applied, setApplied] = useState<DepartureSnapshot>();
  const [preview, setPreview] = useState<DepartureSnapshot>();
  const active = preview ?? applied;
  const samples = active?.candidate.points ?? result.samples;
  const weather = active
    ? {
        ...originalWeather,
        data: active.weather,
        pending: false,
        error: undefined,
      }
    : originalWeather;
  const displayTrip = useMemo(
    () => ({ ...result, samples }),
    [result, samples],
  );
  const points = weather.data?.points;
  const sections = useMemo(
    () => segmentRouteWeather(displayTrip, points ?? []),
    [displayTrip, points],
  );
  const summary = useMemo(
    () => summarizeRouteWeather(sections, points ?? []),
    [sections, points],
  );
  const advisories = useMemo(
    () => groupRouteHazards(samples, points ?? [], sections),
    [samples, points, sections],
  );
  const [selectedWeather, setSelectedWeather] = useState<string>();
  const [selectedAdvisory, setSelectedAdvisory] = useState<string>();
  const [filters, setFilters] = useState<Set<HazardCategory>>(() => new Set());
  const visiblePoints = useMemo(
    () =>
      !filters.size
        ? points
        : points?.filter((point) =>
            assessment(point).hazards.some(({ category }) =>
              filters.has(category),
            ),
          ),
    [filters, points],
  );
  const visibleAdvisories = !filters.size
    ? advisories
    : advisories.filter(({ hazard }) => filters.has(hazard.category));
  const highlightedSections = useMemo(() => {
    const advisory = advisories.find(({ id }) => id === selectedAdvisory);
    if (advisory) return new Set(advisory.segmentIds);
    if (!filters.size) return;
    return new Set(
      sections
        .filter(({ hazards }) =>
          hazards.some(({ category }) => filters.has(category)),
        )
        .map(({ id }) => id),
    );
  }, [advisories, filters, sections, selectedAdvisory]);
  function updateFilters(category?: HazardCategory) {
    setFilters((previous) => {
      if (!category) return new Set();
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    setSelectedWeather(undefined);
    setSelectedAdvisory(undefined);
  }
  const selectWeather = useCallback((id: string) => {
    setSelectedWeather(id);
    setSelectedAdvisory(undefined);
  }, []);
  function selectAdvisory(advisory: RouteHazardSection) {
    setSelectedAdvisory(
      selectedAdvisory === advisory.id ? undefined : advisory.id,
    );
    setSelectedWeather(
      selectedAdvisory === advisory.id ? undefined : advisory.start.id,
    );
  }
  const departureUtc = active?.candidate.departureUtc ?? result.departureUtc;
  const arrivalUtc = active?.candidate.arrivalUtc ?? result.arrivalUtc;
  const { route } = result;
  function clearSelection() {
    setSelectedWeather(undefined);
    setSelectedAdvisory(undefined);
  }
  function previewDeparture(candidate: DepartureRecommendation) {
    if (!comparison.response) return;
    const { resolutionSeconds, horizonSeconds } = comparison.response;
    setPreview({
      candidate,
      weather: {
        provider: "OpenWeather",
        resolutionSeconds,
        horizonSeconds,
        points: candidate.points,
      },
    });
    clearSelection();
  }
  function restoreDeparture() {
    setPreview(undefined);
    setApplied(undefined);
    clearSelection();
  }
  const editableTrip = applied
    ? { ...trip, departureLocal: applied.candidate.departureLocal }
    : trip;

  return (
    <section className="container-shell page-section">
      <ActionLink tone="quiet" to="/" state={{ trip: editableTrip }}>
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
          {active && (
            <p className="mt-3 text-sm font-semibold text-accent">
              {preview ? "Preview departure" : "Applied departure"}
            </p>
          )}
          <p className="mt-4 text-sm text-muted">
            Estimates exclude time spent at stops.
          </p>
          <p className="mt-2 text-xs font-medium text-muted" translate="no">
            Google Maps
          </p>
        </Card>
        <Card>
          <h2 className="section-title">Driving route</h2>
          <RouteMap
            result={result}
            debugSamples={samples}
            sections={sections}
            highlightedSections={highlightedSections}
            weatherPoints={visiblePoints}
            selectedWeather={selectedWeather}
            onWeatherSelect={selectWeather}
          />
          <SeverityLegend />
          {points && (
            <WeatherFilters
              selected={filters}
              onToggle={updateFilters}
              onReset={() => updateFilters()}
            />
          )}
          {result.sampling === "distance-fallback" && (
            <p className="mt-3 text-sm text-muted">
              Some points along this route use distance-based timing estimates.
            </p>
          )}
        </Card>
      </div>
      <DepartureRecommendations
        route={result}
        comparison={comparison}
        weatherPending={originalWeather.pending}
        preview={preview?.candidate}
        applied={applied?.candidate}
        onPreview={previewDeparture}
        onApply={() => {
          if (preview) setApplied(preview);
          setPreview(undefined);
        }}
        onRestore={restoreDeparture}
      />
      {points && (
        <>
          <RouteWeatherSummary summary={summary} advisories={advisories} />
          <HazardAdvisories
            advisories={visibleAdvisories}
            filtered={filters.size > 0}
            selected={selectedAdvisory}
            onSelect={selectAdvisory}
          />
        </>
      )}
      <WeatherTimeline
        weather={weather}
        visiblePoints={visiblePoints}
        filtered={filters.size > 0}
        selected={selectedWeather}
        onSelect={selectWeather}
      />
    </section>
  );
}
