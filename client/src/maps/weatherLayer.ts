import type { RouteWeatherPoint } from "@raincheck/shared";
import { assessment } from "@raincheck/shared/route-weather";
import {
  hazardMeasurement,
  severityPresentation,
} from "../weather/severityPresentation";
import { formatArrival, formatMiles } from "../trips/routes";
import {
  describeWeather,
  forecastIcon,
  formatPrecipitation,
  formatTemperature,
  formatWind,
  pointName,
} from "../weather/presentation";

function details(point: RouteWeatherPoint) {
  const content = document.createElement("div");
  content.className = "max-w-60 space-y-1 text-sm text-ink";
  const title = document.createElement("strong");
  title.textContent = pointName(point);
  content.append(title);

  function line(text: string) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    content.append(paragraph);
  }

  line(`Estimated arrival: ${formatArrival(point.arrivalUtc, point.timeZone)}`);
  line(describeWeather(point));
  if (point.status === "available") {
    const f = point.forecast;
    line(`Forecast time: ${formatArrival(f.timestampUtc, point.timeZone)}`);
    if (f.temperatureC !== undefined)
      line(`Temperature: ${formatTemperature(f.temperatureC)}`);
    if (f.feelsLikeC !== undefined)
      line(`Feels like: ${formatTemperature(f.feelsLikeC)}`);
    if (f.precipitationProbability !== undefined)
      line(`Precipitation: ${formatPrecipitation(f.precipitationProbability)}`);
    if (f.windMetersPerSecond !== undefined)
      line(`Wind: ${formatWind(f.windMetersPerSecond)}`);
    if (f.gustMetersPerSecond !== undefined)
      line(`Wind gusts: ${formatWind(f.gustMetersPerSecond)}`);
    if (f.visibilityMeters !== undefined)
      line(`Visibility: ${formatMiles(f.visibilityMeters)}`);
    if (f.humidityPercent !== undefined)
      line(`Humidity: ${f.humidityPercent}%`);
  }
  const classification = assessment(point);
  line(`Severity: ${severityPresentation[classification.severity].label}`);
  line(classification.explanation);
  for (const hazard of classification.hazards) {
    const measurement = hazardMeasurement(hazard.measurement);
    line(
      `${hazard.label}${measurement ? ` · ${measurement}` : ""}. ${hazard.explanation}`,
    );
  }
  return content;
}

export function createWeatherLayer(
  map: google.maps.Map,
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement,
  InfoWindow: typeof google.maps.InfoWindow,
) {
  const markers = new Map<
    string,
    {
      point: RouteWeatherPoint;
      marker: google.maps.marker.AdvancedMarkerElement;
      badge: HTMLSpanElement;
    }
  >();
  let handlers: AbortController | undefined;
  let active: string | undefined;
  let popup: google.maps.InfoWindow | undefined;

  function clear() {
    if (!markers.size) return;
    handlers?.abort();
    for (const { marker } of markers.values()) marker.map = null;
    markers.clear();
    popup?.close();
    active = undefined;
  }

  function select(id?: string, fromMarker = false) {
    const selection = id ? markers.get(id) : undefined;
    const old = active ? markers.get(active) : undefined;
    if (active === id && !fromMarker) return;
    old?.badge.removeAttribute("data-selected");
    active = selection && id;
    if (!selection) {
      popup?.close();
      return;
    }
    selection.badge.dataset.selected = "true";
    popup ??= new InfoWindow();
    popup.setContent(details(selection.point));
    popup.open({ map, anchor: selection.marker, shouldFocus: fromMarker });
  }

  return {
    clear,
    select,
    setPoints(points: RouteWeatherPoint[], onSelect?: (id: string) => void) {
      clear();
      handlers = new AbortController();
      for (const point of points) {
        const badge = document.createElement("span");
        badge.className = "weather-map-pin";
        const severity = assessment(point).severity;
        const appearance = severityPresentation[severity];
        badge.style.borderColor = appearance.color;
        badge.dataset.availability = point.status;
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = forecastIcon(
          point.status === "available" ? point.forecast : undefined,
        ).glyph;
        const status = document.createElement("span");
        status.className = "weather-pin-severity";
        status.style.background = appearance.color;
        status.textContent = appearance.symbol;
        badge.append(status);
        const namedStop = point.kind !== "intermediate";
        const marker = new AdvancedMarkerElement({
          map,
          position: point.coordinate,
          title: `${pointName(point)} weather · ${describeWeather(point)} · ${appearance.label}`,
          gmpClickable: true,
          anchorLeft: namedStop ? "-130%" : "-50%",
          anchorTop: namedStop ? "-135%" : "-95%",
          zIndex: 20,
        });
        marker.append(badge);
        marker.addEventListener(
          "gmp-click",
          () => {
            select(point.id, true);
            onSelect?.(point.id);
          },
          { signal: handlers.signal },
        );
        markers.set(point.id, { marker, point, badge });
      }
    },
  };
}

export type WeatherLayer = ReturnType<typeof createWeatherLayer>;
