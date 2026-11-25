// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type {
  RouteRequest,
  RouteResponse,
  RouteSample,
  RouteWeatherResponse,
} from "@raincheck/shared";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { Results } from "./Results";

vi.mock("../components/RouteMap", () => ({
  RouteMap: () => (
    <div role="region" aria-label="Interactive driving route map" />
  ),
}));

const first: RouteSample = {
  id: "start",
  kind: "origin",
  name: "Gainesville",
  coordinate: { lat: 29.65, lng: -82.32 },
  timeZone: "America/New_York",
  arrivalUtc: "2030-06-15T12:00:00Z",
  elapsedSeconds: 0,
  distanceMeters: 0,
};
const last: RouteSample = {
  id: "finish",
  kind: "destination",
  name: "Pensacola",
  coordinate: { lat: 30.42, lng: -87.21 },
  timeZone: "America/Chicago",
  arrivalUtc: "2030-06-15T17:30:00Z",
  elapsedSeconds: 19800,
  distanceMeters: 550000,
};
const samples = [first, last];
const planned = {
  trip: {
    origin: {
      placeId: "a",
      address: "Gainesville, FL",
      coordinate: first.coordinate,
    },
    destination: {
      placeId: "b",
      address: "Pensacola, FL",
      coordinate: last.coordinate,
    },
    waypoints: [],
    departureLocal: "2030-06-15T08:00",
  } satisfies RouteRequest,
  result: {
    route: {
      trafficAware: true,
      distanceMeters: 550000,
      durationSeconds: 19800,
      encodedPolyline: "stub",
      legs: [],
      coordinates: [first.coordinate, last.coordinate],
    },
    departureUtc: first.arrivalUtc,
    arrivalUtc: last.arrivalUtc,
    samples,
    sampling: "step-duration",
  } satisfies RouteResponse,
};
const weather: RouteWeatherResponse = {
  provider: "OpenWeather",
  resolutionSeconds: 10800,
  horizonSeconds: 432000,
  points: [
    {
      ...first,
      status: "available",
      retrievedAtUtc: "2030-06-14T12:00:00Z",
      offsetSeconds: 3600,
      forecast: {
        timestampUtc: "2030-06-15T13:00:00Z",
        temperatureC: 20,
        description: "light rain",
        iconId: "10d",
        precipitationProbability: 0,
        windMetersPerSecond: 4,
      },
    },
    { ...last, status: "outside-range" },
  ],
};

function NextTrip() {
  const navigate = useNavigate();
  function next() {
    const nextSamples = [{ ...first, name: "New origin" }, last];
    void navigate("/results", {
      state: {
        ...planned,
        result: { ...planned.result, samples: nextSamples },
      },
    });
  }
  return <button onClick={next}>Load another trip</button>;
}

function openResults(fetcher: typeof fetch) {
  vi.stubGlobal("fetch", fetcher);
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname: "/results", state: planned }]}>
        <NextTrip />
        <Results />
      </MemoryRouter>
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("loads once, keeps the map visible, and renders a chronological partial forecast with separate times", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  openResults(fetcher);
  expect(screen.getByText("Loading weather for your route…")).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Interactive driving route map" }),
  ).toBeVisible();
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/weather/route");
  finish(Response.json(weather));

  const section = screen.getByRole("region", { name: "Route weather" });
  expect(await within(section).findByText(/light rain.*68 °F/)).toBeVisible();
  expect(within(section).getByText("Precipitation 0%")).toBeVisible();
  expect(within(section).getByText("Wind 9 mph")).toBeVisible();
  expect(within(section).getByText(/available for only part/)).toBeVisible();
  expect(within(section).getByText("Outside forecast coverage")).toBeVisible();
  const rows = within(section).getAllByRole("listitem");
  expect(rows[0]?.querySelectorAll("time")[0]).toHaveAttribute(
    "datetime",
    first.arrivalUtc,
  );
  expect(rows[0]?.querySelectorAll("time")[1]).toHaveAttribute(
    "datetime",
    "2030-06-15T13:00:00Z",
  );
  expect(rows[1]).toHaveTextContent("Pensacola");
});

test("shows a horizon warning for a trip without any supported forecast times", async () => {
  openResults(
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          ...weather,
          points: samples.map((sample) => ({
            ...sample,
            status: "outside-range",
          })),
        }),
      ),
  );
  expect(
    await screen.findByText(/Check again closer to departure/),
  ).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Interactive driving route map" }),
  ).toBeVisible();
});

test("keeps the driving route after a weather API error and can retry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { error: { message: "Weather service temporarily unavailable." } },
        { status: 502 },
      ),
    )
    .mockResolvedValueOnce(Response.json(weather));
  openResults(fetcher);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Weather service temporarily unavailable.",
  );
  expect(screen.getByText("Driving distance")).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Interactive driving route map" }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Retry weather" }));
  expect(await screen.findByText(/light rain/)).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("ignores stale weather from a previous route", async () => {
  let finish!: (response: Response) => void;
  const revised = {
    ...weather,
    points: [
      { ...first, name: "New origin", status: "unavailable" },
      weather.points[1],
    ],
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json(revised));
  openResults(fetcher);
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  await userEvent.click(
    screen.getByRole("button", { name: "Load another trip" }),
  );
  expect(await screen.findByText("New origin")).toBeVisible();
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  finish(Response.json(weather));
  await waitFor(() => expect(screen.getByText("New origin")).toBeVisible());
  expect(screen.queryByText(/light rain/)).not.toBeInTheDocument();
});
