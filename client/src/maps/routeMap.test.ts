// @vitest-environment jsdom
import type { RouteCoordinate, RouteResponse } from "@raincheck/shared";
import { beforeEach, expect, test, vi } from "vitest";
import { drawRoute } from "./routeMap";

const sdk = vi.hoisted(() => ({
  fit: vi.fn(),
  extend: vi.fn(),
  polyline: vi.fn(),
  detach: vi.fn(),
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
          constructor({ map }: { map: unknown }) {
            const marker = Object.assign(document.createElement("div"), {
              map,
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

test("fits the route, draws the blue path, and labels only trip stops in normal mode", async () => {
  const controller = new AbortController();
  await drawRoute(
    document.createElement("div"),
    result,
    false,
    controller.signal,
  );
  expect(sdk.polyline).toHaveBeenCalledWith(
    expect.objectContaining({ path: coordinates, strokeColor: "#2563eb" }),
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
