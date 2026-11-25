// @vitest-environment jsdom
import type { RouteCoordinate, RouteResponse } from "@raincheck/shared";
import { beforeEach, expect, test, vi } from "vitest";
import { drawRoute } from "./routeMap";

const sdk = vi.hoisted(() => ({
  fit: vi.fn(),
  extend: vi.fn(),
  polyline: vi.fn(),
  detach: vi.fn(),
  options: vi.fn(),
  markers: [] as (HTMLElement & { map: unknown })[],
  content: vi.fn<(element: HTMLElement) => void>(),
  open: vi.fn(),
  close: vi.fn(),
}));

vi.mock("./google", () => ({
  mapsLibrary: async (name: "maps" | "core" | "marker") =>
    ({
      maps: {
        Map: class {
          fitBounds = sdk.fit;
        },
        Polyline: class {
          setMap = sdk.detach;
          setOptions = sdk.options;
          constructor(options: unknown) {
            sdk.polyline(options);
          }
        },
        InfoWindow: class {
          setContent = sdk.content;
          open = sdk.open;
          close = sdk.close;
        },
      },
      core: {
        LatLngBounds: class {
          extend = sdk.extend;
        },
      },
      marker: {
        AdvancedMarkerElement: class {
          constructor({ map, title }: { map: unknown; title: string }) {
            const marker = Object.assign(document.createElement("div"), {
              map,
              title,
            });
            sdk.markers.push(marker);
            return marker;
          }
        },
        PinElement: class {
          constructor() {
            return document.createElement("span");
          }
        },
      },
    })[name],
}));

const point = (lng: number): RouteCoordinate => ({ lat: 0, lng });
const start = "2030-06-15T12:00:00Z";
const coordinates = [0, 1, 2, 3].map(point);
const result: RouteResponse = {
  departureUtc: start,
  arrivalUtc: "2030-06-15T13:30:00Z",
  sampling: "step-duration",
  route: {
    durationSeconds: 5400,
    distanceMeters: 3000,
    encodedPolyline: "fixture",
    coordinates,
    legs: [],
    trafficAware: true,
  },
  samples: (["origin", "intermediate", "waypoint", "destination"] as const).map(
    (kind, index) => ({
      id: kind,
      kind,
      coordinate: point(index),
      elapsedSeconds: index * 1800,
      distanceMeters: index * 1000,
      arrivalUtc: new Date(Date.parse(start) + index * 1800_000).toISOString(),
    }),
  ),
};

beforeEach(() => {
  vi.clearAllMocks();
  sdk.markers.length = 0;
});

test("fits the route, draws the gray path, and labels only trip stops in normal mode", async () => {
  const controller = new AbortController();
  await drawRoute(
    document.createElement("div"),
    result,
    false,
    controller.signal,
  );
  expect(sdk.polyline).toHaveBeenCalledWith(
    expect.objectContaining({ path: coordinates, strokeColor: "#64748b" }),
  );
  expect(sdk.fit).toHaveBeenCalledOnce();
  expect(sdk.markers).toHaveLength(3);
  controller.abort();
  expect(sdk.detach).toHaveBeenCalledWith(null);
  expect(sdk.markers.every((marker) => marker.map === null)).toBe(true);
});

test("enables interactive debug details for timed samples", async () => {
  const controller = new AbortController();
  await drawRoute(
    document.createElement("div"),
    result,
    true,
    controller.signal,
  );
  expect(sdk.markers).toHaveLength(4);
  sdk.markers[1]?.dispatchEvent(new Event("gmp-click"));
  expect(sdk.content.mock.lastCall?.[0].textContent).toContain(
    "0.00000, 1.00000",
  );
  expect(sdk.content.mock.lastCall?.[0].textContent).toContain(
    "Estimated arrival:",
  );
  expect(sdk.content.mock.lastCall?.[0].textContent).toContain(
    "Elapsed driving: 30 min",
  );
  expect(sdk.content.mock.lastCall?.[0].textContent).toContain(
    "Cumulative distance: 0.6 mi",
  );
  expect(sdk.open).toHaveBeenCalledOnce();
  controller.abort();
  expect(sdk.close).toHaveBeenCalledOnce();
});

test("overlays weather markers on the existing map and shows point details without refitting", async () => {
  const controller = new AbortController();
  const weather = await drawRoute(
    document.createElement("div"),
    result,
    false,
    controller.signal,
  );
  const origin = result.samples[0]!;
  const destination = result.samples.at(-1)!;
  const select = vi.fn();
  weather.setPoints(
    [
      {
        ...origin,
        name: "Gainesville",
        status: "available",
        retrievedAtUtc: start,
        offsetSeconds: 0,
        forecast: {
          timestampUtc: start,
          iconId: "10d",
          description: "light rain",
          temperatureC: 20,
          feelsLikeC: 19,
          precipitationProbability: 0,
          windMetersPerSecond: 4,
          gustMetersPerSecond: 8,
          visibilityMeters: 10000,
          humidityPercent: 60,
        },
      },
      { ...destination, status: "outside-range" },
    ],
    select,
  );
  const available = sdk.markers[3]!;
  const unavailable = sdk.markers[4]!;
  expect(available.title).toContain("Gainesville weather");
  expect(unavailable.title).toContain("Outside forecast coverage");
  available.dispatchEvent(new Event("gmp-click"));
  expect(select).toHaveBeenCalledWith("origin");
  expect(available.firstElementChild?.getAttribute("data-selected")).toBe(
    "true",
  );
  const popup = sdk.content.mock.lastCall?.[0].textContent;
  expect(popup).toContain("Forecast time:");
  expect(popup).toContain("Temperature: 68 °F");
  expect(popup).toContain("Feels like: 66 °F");
  expect(popup).toContain("Precipitation: 0%");
  expect(popup).toContain("Wind gusts: 18 mph");
  expect(popup).toContain("Visibility: 6.2 mi");
  expect(popup).toContain("Humidity: 60%");
  weather.select("destination");
  expect(available.firstElementChild?.hasAttribute("data-selected")).toBe(
    false,
  );
  expect(unavailable.firstElementChild?.getAttribute("data-selected")).toBe(
    "true",
  );
  expect(sdk.content.mock.lastCall?.[0].textContent).toContain(
    "Outside forecast coverage",
  );
  expect(sdk.fit).toHaveBeenCalledOnce();
  expect(sdk.polyline).toHaveBeenCalledOnce();
  controller.abort();
  expect(sdk.markers.every((marker) => marker.map === null)).toBe(true);
  available.dispatchEvent(new Event("gmp-click"));
  expect(select).toHaveBeenCalledOnce();
});

test("colors road sections and emphasizes selected sections without refitting the map", async () => {
  const controller = new AbortController();
  const map = await drawRoute(
    document.createElement("div"),
    result,
    false,
    controller.signal,
  );
  const start = result.samples[0]!;
  const end = result.samples[1]!;
  map.setSections([
    {
      id: "known",
      start,
      end,
      coordinates: coordinates.slice(0, 2),
      severity: "hazardous",
      durationSeconds: 1800,
      distanceMeters: 1000,
      hazards: [],
    },
    {
      id: "gap",
      start: end,
      end: result.samples[3]!,
      coordinates: coordinates.slice(1),
      severity: "unknown",
      durationSeconds: 3600,
      distanceMeters: 2000,
      hazards: [],
    },
  ]);
  expect(sdk.polyline).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      strokeColor: "#b91c1c",
      path: coordinates.slice(0, 2),
    }),
  );
  expect(sdk.polyline).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      strokeColor: "#64748b",
      path: coordinates.slice(1),
    }),
  );
  map.highlightSections(new Set(["known"]));
  expect(sdk.options).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ strokeWeight: 8, strokeOpacity: 0.95 }),
  );
  expect(sdk.options).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ strokeWeight: 5, strokeOpacity: 0.32 }),
  );
  expect(sdk.fit).toHaveBeenCalledOnce();
  controller.abort();
});
