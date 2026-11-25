import type {
  RouteResponse,
  RouteSample,
  RouteWeatherSegment,
} from "@raincheck/shared";
import { formatArrival, formatDuration, formatMiles } from "../trips/routes";
import { severityPresentation } from "../weather/severityPresentation";
import { mapsLibrary } from "./google";
import { createWeatherLayer } from "./weatherLayer";

function sampleDetails(sample: RouteSample) {
  const container = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = sample.name ?? "Sampled route point";
  container.append(title);
  const { lat, lng } = sample.coordinate;
  for (const text of [
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    `Estimated arrival: ${formatArrival(sample.arrivalUtc, sample.timeZone)}`,
    `Elapsed driving: ${formatDuration(sample.elapsedSeconds)}`,
    `Cumulative distance: ${formatMiles(sample.distanceMeters)}`,
  ]) {
    const line = document.createElement("p");
    line.textContent = text;
    container.append(line);
  }
  return container;
}

export async function drawRoute(
  element: HTMLElement,
  { route, samples }: RouteResponse,
  debug: boolean,
  signal: AbortSignal,
) {
  const [
    { Map, Polyline, InfoWindow },
    { LatLngBounds },
    { AdvancedMarkerElement, PinElement },
  ] = await Promise.all([
    mapsLibrary("maps"),
    mapsLibrary("core"),
    mapsLibrary("marker"),
  ]);
  signal.throwIfAborted();

  const map = new Map(element, {
    mapId: import.meta.env.VITE_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID",
    center: route.coordinates[0],
    zoom: 6,
    mapTypeControl: false,
    streetViewControl: false,
  });
  const bounds = new LatLngBounds();
  const path = new Polyline({
    map,
    path: route.coordinates,
    strokeColor: severityPresentation.unknown.color,
    strokeOpacity: 0.95,
    strokeWeight: 5,
  });
  for (const point of route.coordinates) bounds.extend(point);

  const weather = createWeatherLayer(map, AdvancedMarkerElement, InfoWindow);
  const overlays = new globalThis.Map<string, google.maps.Polyline>();
  function clearSections() {
    for (const overlay of overlays.values()) overlay.setMap(null);
    overlays.clear();
  }
  function setSections(sections: RouteWeatherSegment[]) {
    clearSections();
    for (const section of sections) {
      if (section.coordinates.length < 2) continue;
      overlays.set(
        section.id,
        new Polyline({
          map,
          path: section.coordinates,
          strokeColor: severityPresentation[section.severity].color,
          strokeOpacity: 0.95,
          strokeWeight: 5,
        }),
      );
    }
    path.setMap(overlays.size ? null : map);
  }
  function highlightSections(ids?: ReadonlySet<string>) {
    for (const [id, overlay] of overlays) {
      const focused = ids?.has(id);
      overlay.setOptions({
        strokeOpacity: !ids || focused ? 0.95 : 0.32,
        strokeWeight: focused ? 8 : 5,
        zIndex: focused ? 2 : 1,
      });
    }
  }
  const info = debug ? new InfoWindow() : undefined;
  const pins: google.maps.marker.AdvancedMarkerElement[] = [];
  let stop = 0;

  function dispose() {
    signal.removeEventListener("abort", dispose);
    weather.clear();
    clearSections();
    info?.close();
    for (const marker of pins) marker.map = null;
    path.setMap(null);
    element.replaceChildren();
  }

  signal.addEventListener("abort", dispose, { once: true });
  try {
    for (const sample of samples) {
      if (sample.kind === "intermediate" && !debug) continue;
      const glyphText =
        sample.kind === "origin"
          ? "A"
          : sample.kind === "destination"
            ? "B"
            : sample.kind === "waypoint"
              ? String(++stop)
              : "·";
      const marker = new AdvancedMarkerElement({
        map,
        position: sample.coordinate,
        title: sample.name ?? "Sampled route point",
        gmpClickable: debug,
      });
      pins.push(marker);
      marker.append(
        new PinElement({
          glyphText,
          glyphColor: "white",
          borderColor: "#1e40af",
          background: sample.kind === "intermediate" ? "#466777" : "#2563eb",
          scale: sample.kind === "intermediate" ? 0.7 : 1,
        }),
      );
      bounds.extend(sample.coordinate);
      if (info) {
        marker.addEventListener(
          "gmp-click",
          () => {
            info.setContent(sampleDetails(sample));
            info.open({ map, anchor: marker });
          },
          { signal },
        );
      }
    }
    map.fitBounds(bounds, 36);
    return { ...weather, setSections, highlightSections };
  } catch (error) {
    dispose();
    throw error;
  }
}
