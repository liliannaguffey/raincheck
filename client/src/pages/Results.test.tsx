// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type {
  DepartureCandidate,
  DepartureResponse,
  DepartureRecommendation,
  RouteRequest,
  RouteResponse,
  RouteSample,
  RouteWeatherResponse,
  RouteWeatherPoint,
  RouteWeatherSegment,
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
  RouteMap: ({
    selectedWeather,
    onWeatherSelect,
    weatherPoints,
    highlightedSections,
    sections,
  }: {
    selectedWeather?: string;
    onWeatherSelect?: (id: string) => void;
    weatherPoints?: RouteWeatherPoint[];
    highlightedSections?: ReadonlySet<string>;
    sections?: RouteWeatherSegment[];
  }) => (
    <div
      role="region"
      aria-label="Interactive driving route map"
      data-selection={selectedWeather}
      data-markers={weatherPoints?.map(({ id }) => id).join(",")}
      data-arrivals={weatherPoints
        ?.map(({ arrivalUtc }) => arrivalUtc)
        .join(",")}
      data-severities={sections?.map(({ severity }) => severity).join(",")}
      data-highlighted={
        highlightedSections ? [...highlightedSections].join(",") : undefined
      }
    >
      <button onClick={() => onWeatherSelect?.("finish")}>
        Select weather marker
      </button>
    </div>
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

function openResults(
  fetcher: typeof fetch,
  compare: typeof fetch = async () => Response.json(noImprovement),
) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    input === "/api/departures/recommendations"
      ? compare(input, init)
      : fetcher(input, init),
  );

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
    vi.fn().mockResolvedValue(
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

test("synchronizes the timeline and map selection without fetching again", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(weather));
  openResults(fetcher);
  const origin = await screen.findByRole("button", {
    name: "Show weather on map for Gainesville",
  });
  const destination = screen.getByRole("button", {
    name: "Show weather on map for Pensacola",
  });
  const map = screen.getByRole("region", {
    name: "Interactive driving route map",
  });
  await userEvent.click(origin);
  expect(map).toHaveAttribute("data-selection", "start");
  expect(origin).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(
    within(map).getByRole("button", { name: "Select weather marker" }),
  );
  expect(destination).toHaveAttribute("aria-pressed", "true");
  expect(origin).toHaveAttribute("aria-pressed", "false");
  expect(fetcher).toHaveBeenCalledOnce();
});

const classifiedWeather: RouteWeatherResponse = {
  ...weather,
  points: [
    {
      ...first,
      status: "available",
      offsetSeconds: 0,
      retrievedAtUtc: first.arrivalUtc,
      forecast: {
        timestampUtc: first.arrivalUtc,
        temperatureC: 20,
        description: "moderate rain",
        iconId: "10d",
      },
      classification: {
        severity: "caution",
        availability: "available",
        completeness: "sufficient",
        explanation: "Rain may reduce traction.",
        hazards: [
          {
            id: "rain",
            category: "rain",
            severity: "caution",
            label: "Moderate rain",
            explanation: "Rain may reduce traction.",
          },
        ],
      },
    },
    {
      ...last,
      status: "available",
      offsetSeconds: 0,
      retrievedAtUtc: first.arrivalUtc,
      forecast: {
        timestampUtc: last.arrivalUtc,
        temperatureC: 19,
        description: "strong gusts",
        iconId: "04d",
      },
      classification: {
        severity: "hazardous",
        availability: "available",
        completeness: "sufficient",
        explanation: "Strong gusts may affect steering.",
        hazards: [
          {
            id: "gust",
            category: "winds",
            severity: "hazardous",
            label: "Strong wind gusts",
            explanation: "Strong gusts may affect steering.",
            measurement: { value: 21, unit: "m/s", threshold: 20.6 },
          },
        ],
      },
    },
  ],
};

test("shows the accessible severity legend, route exposure and linked weather advisories", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(classifiedWeather));
  openResults(fetcher);
  const legend = screen.getByRole("list", { name: "Route weather legend" });
  expect(
    within(legend).getByText("Weather unavailable or insufficient"),
  ).toBeVisible();
  const summary = await screen.findByRole("region", {
    name: "Weather summary",
  });
  expect(
    within(summary).getByText("Potentially hazardous", { exact: true }),
  ).toBeVisible();
  expect(within(summary).getByText("100%", { exact: true })).toBeVisible();
  expect(within(summary).getByText("5 hr 30 min")).toBeVisible();
  const advisories = screen.getByRole("region", {
    name: "RainCheck weather advisories",
  });
  expect(within(advisories).getByText(/47 mph/)).toBeVisible();
  const highlight = within(advisories).getByRole("button", {
    name: "Highlight strong wind gusts",
  });
  await userEvent.click(highlight);
  expect(highlight).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("region", { name: "Interactive driving route map" }),
  ).toHaveAttribute("data-selection", "finish");
  expect(fetcher).toHaveBeenCalledOnce();
});

test("filters markers, advisories and timeline locally while preserving the whole-route assessment", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(classifiedWeather));
  openResults(fetcher);
  const user = userEvent.setup();
  const filters = await screen.findByRole("group", { name: "Weather filters" });
  const map = screen.getByRole("region", {
    name: "Interactive driving route map",
  });
  const summary = screen.getByRole("region", { name: "Weather summary" });
  const advisories = screen.getByRole("region", {
    name: "RainCheck weather advisories",
  });
  const timeline = screen.getByRole("region", { name: "Route weather" });
  const rain = within(filters).getByRole("button", { name: "Rain" });
  const wind = within(filters).getByRole("button", { name: "Strong winds" });
  const showAll = within(filters).getByRole("button", { name: "Show all" });

  rain.focus();
  await user.keyboard(" ");
  expect(rain).toHaveAttribute("aria-pressed", "true");
  expect(map).toHaveAttribute("data-markers", "start");
  expect(map).toHaveAttribute("data-highlighted", "weather-section-1");
  expect(
    within(timeline).getByText(
      "Showing 1 of 2 weather points with selected hazards.",
    ),
  ).toBeVisible();
  expect(
    within(advisories).queryByRole("heading", { name: "Strong wind gusts" }),
  ).not.toBeInTheDocument();
  expect(
    within(summary).getByText("Potentially hazardous", { exact: true }),
  ).toBeVisible();
  expect(
    within(summary).getByText(/Identified hazards include.*Strong wind gusts/),
  ).toBeVisible();

  await user.click(wind);
  expect(map).toHaveAttribute("data-markers", "start,finish");
  await user.click(rain);
  expect(map).toHaveAttribute("data-markers", "finish");
  await user.click(showAll);
  expect(showAll).toHaveAttribute("aria-pressed", "true");
  expect(wind).toHaveAttribute("aria-pressed", "false");
  await user.click(
    within(filters).getByRole("button", { name: "Thunderstorms" }),
  );
  expect(
    within(timeline).getByText(
      "No timeline points match the selected categories.",
    ),
  ).toBeVisible();
  expect(
    within(advisories).getByText(
      "No advisories match the selected categories.",
    ),
  ).toBeVisible();
  expect(map).toHaveAttribute("data-markers", "");
  expect(fetcher).toHaveBeenCalledOnce();
});

const baseline: DepartureCandidate = {
  id: first.arrivalUtc,
  departureUtc: first.arrivalUtc,
  departureLocal: "2030-06-15T08:00",
  originTimeZone: "America/New_York",
  arrivalUtc: last.arrivalUtc,
  arrivalLocal: "2030-06-15T12:30:00",
  destinationTimeZone: "America/Chicago",
  durationSeconds: last.elapsedSeconds,
  offsetSeconds: 0,
  score: 100,
  coverageFraction: 1,
  exposure: {
    favorable: 0,
    caution: 0,
    hazardous: last.elapsedSeconds,
    unknown: 0,
  },
  hazards: {
    gust: { label: "Strong wind gusts", seconds: last.elapsedSeconds },
  },
  eligibility: "eligible",
};
const noImprovement: DepartureResponse = {
  baseline,
  evaluatedCount: 13,
  recommendations: [],
  status: "no-improvement",
  minimumCoverage: 0.9,
  resolutionSeconds: 10800,
  horizonSeconds: 432000,
};
const alternative: DepartureRecommendation = {
  ...baseline,
  id: "alternative",
  departureUtc: "2030-06-15T13:00:00Z",
  departureLocal: "2030-06-15T09:00",
  arrivalUtc: "2030-06-15T18:30:00Z",
  arrivalLocal: "2030-06-15T13:30:00",
  distinction: "best-overall",
  offsetSeconds: 3600,
  score: 0,
  hazards: {},
  exposure: {
    favorable: last.elapsedSeconds,
    caution: 0,
    hazardous: 0,
    unknown: 0,
  },
  improvement: {
    scorePoints: 100,
    hazardousSeconds: last.elapsedSeconds,
    cautionSeconds: 0,
    reducedHazards: [
      {
        label: "Strong wind gusts",
        originalSeconds: last.elapsedSeconds,
        candidateSeconds: 0,
      },
    ],
    newHazards: [],
  },
  points: classifiedWeather.points.map((point) => ({
    ...point,
    arrivalUtc: new Date(Date.parse(point.arrivalUtc) + 3600000).toISOString(),
    classification: {
      severity: "favorable",
      availability: "available",
      completeness: "sufficient",
      hazards: [],
      explanation: "Clear forecast.",
    },
    ...(point.status === "available"
      ? {
          forecast: {
            ...point.forecast,
            condition: "Clear",
            description: "clear skies",
          },
        }
      : {}),
  })),
};
const withRecommendation: DepartureResponse = {
  ...noImprovement,
  status: "available",
  recommendations: [alternative],
};

test("previews, restores and applies an alternative without refetching the route or weather", async () => {
  const forecast = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(classifiedWeather));
  const compare = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(withRecommendation));
  openResults(forecast, compare);
  const user = userEvent.setup();
  const panel = screen.getByRole("region", {
    name: "Find a better time to leave",
  });
  const preview = await within(panel).findByRole("button", {
    name: "Preview departure",
  });
  expect(
    within(panel).getByText(/5 hr 30 min less hazardous exposure/),
  ).toBeVisible();
  expect(
    within(panel).getByText(/100.0 exposure-score points lower/),
  ).toBeVisible();
  expect(JSON.parse(String(compare.mock.calls[0]?.[1]?.body))).toMatchObject({
    departureUtc: first.arrivalUtc,
    flexibility: { hours: 3, direction: "either" },
  });
  const map = screen.getByRole("region", {
    name: "Interactive driving route map",
  });
  const timeline = screen.getByRole("region", { name: "Route weather" });

  await user.click(preview);
  expect(
    within(panel).getByText("Previewing an alternative departure"),
  ).toBeVisible();
  expect(map).toHaveAttribute(
    "data-arrivals",
    "2030-06-15T13:00:00.000Z,2030-06-15T18:30:00.000Z",
  );
  expect(map).toHaveAttribute("data-severities", "favorable");
  expect(within(timeline).getAllByText(/clear skies/)).toHaveLength(2);
  expect(
    screen.getByText(
      "No supported hazards were identified in the available forecasts.",
    ),
  ).toBeVisible();

  await user.click(
    within(panel).getByRole("button", { name: "Return to original" }),
  );
  expect(map).toHaveAttribute("data-severities", "hazardous");
  const advisories = screen.getByRole("region", {
    name: "RainCheck weather advisories",
  });
  expect(
    within(advisories).getByRole("heading", { name: "Strong wind gusts" }),
  ).toBeVisible();

  await user.click(preview);
  await user.click(
    within(panel).getByRole("button", { name: "Apply alternative" }),
  );
  expect(
    within(panel).getByText("Alternative departure applied"),
  ).toBeVisible();
  expect(screen.getByText("Applied departure")).toBeVisible();
  expect(map).toHaveAttribute("data-severities", "favorable");
  expect(forecast).toHaveBeenCalledOnce();
  expect(compare).toHaveBeenCalledOnce();
});

test("allows flexibility changes, handles no flexibility, and ignores a stale comparison", async () => {
  const release: { response?: (value: Response) => void } = {};
  const compare = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release.response = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ ...noImprovement, status: "insufficient-coverage" }),
    );
  openResults(vi.fn().mockResolvedValue(Response.json(weather)), compare);
  const user = userEvent.setup();
  const panel = screen.getByRole("region", {
    name: "Find a better time to leave",
  });
  const flexibility = within(panel).getByLabelText("Departure flexibility");
  await waitFor(() => expect(compare).toHaveBeenCalledOnce());
  expect(within(panel).getByText("Comparing departure times…")).toBeVisible();
  await user.selectOptions(flexibility, "0");
  expect(
    within(panel).getByText("Departure flexibility is turned off."),
  ).toBeVisible();
  expect(
    within(panel).getByRole("button", { name: "Compare departures" }),
  ).toBeDisabled();
  await user.selectOptions(flexibility, "1");
  await user.selectOptions(
    within(panel).getByLabelText("Departure direction"),
    "later",
  );
  await user.click(
    within(panel).getByRole("button", { name: "Compare departures" }),
  );
  expect(
    await within(panel).findByText(/At least 90% classified driving time/),
  ).toBeVisible();
  expect(compare.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(
    JSON.parse(String(compare.mock.calls[1]?.[1]?.body)).flexibility,
  ).toEqual({ hours: 1, direction: "later" });
  release.response?.(Response.json(withRecommendation));
  expect(
    within(panel).queryByRole("button", { name: "Preview departure" }),
  ).not.toBeInTheDocument();
});

test("states when the original departure remains the recommendation", async () => {
  openResults(vi.fn().mockResolvedValue(Response.json(weather)));
  expect(
    await screen.findByText(/No meaningful weather improvement/),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Original departure" }),
  ).toBeVisible();
});
