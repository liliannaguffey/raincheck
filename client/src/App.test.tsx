// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { RoutePlace, RouteResponse } from "@raincheck/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { createPlaceSearch } from "./maps/places";

const start: RoutePlace = {
  placeId: "start",
  address: "Gainesville, FL",
  coordinate: { lat: 29.652, lng: -82.325 },
};
const end: RoutePlace = {
  placeId: "end",
  address: "Atlanta, GA",
  coordinate: { lat: 33.748, lng: -84.389 },
};
const stop: RoutePlace = {
  placeId: "stop",
  address: "Valdosta, GA",
  coordinate: { lat: 30.832, lng: -83.278 },
};
const result: RouteResponse = {
  departureUtc: "2030-06-16T03:30:00Z",
  arrivalUtc: "2030-06-16T08:30:00Z",
  sampling: "step-duration",
  route: {
    distanceMeters: 483_000,
    durationSeconds: 18_000,
    trafficAware: true,
    encodedPolyline: "fixture",
    coordinates: [start.coordinate, end.coordinate],
    legs: [],
  },
  samples: [
    {
      id: "start",
      kind: "origin",
      coordinate: start.coordinate,
      elapsedSeconds: 0,
      distanceMeters: 0,
      arrivalUtc: "2030-06-16T03:30:00Z",
      timeZone: "America/New_York",
    },
    {
      id: "end",
      kind: "destination",
      coordinate: end.coordinate,
      elapsedSeconds: 18000,
      distanceMeters: 483_000,
      arrivalUtc: "2030-06-16T08:30:00Z",
      timeZone: "America/New_York",
    },
  ],
};

vi.mock(import("./maps/places"), () => ({ createPlaceSearch: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openApp(path = "/") {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(createPlaceSearch).mockImplementation(() => ({
    reset: vi.fn(),
    search: async (input) =>
      [start, end, stop]
        .filter(({ address }) =>
          address.toLowerCase().includes(input.toLowerCase()),
        )
        .map((place) => ({
          id: place.placeId,
          text: place.address,
          select: async () => place,
        })),
  }));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(result));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return { user, fetcher };
}

async function choosePlace(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  text: string,
  place: RoutePlace,
  keyboard = false,
) {
  const input = screen.getByRole("combobox", { name: field });
  await user.type(input, text);
  const option = await screen.findByRole("option", { name: place.address });
  if (keyboard) await user.keyboard("{ArrowDown}{Enter}");
  else await user.click(option);
  await waitFor(() => expect(input).toHaveValue(place.address));
}

async function fillTrip(user: ReturnType<typeof userEvent.setup>) {
  await choosePlace(user, "Starting location", "Gain", start, true);
  await choosePlace(user, "Destination", "Atl", end);
  fireEvent.change(screen.getByLabelText("Departure date"), {
    target: { value: "2030-06-15" },
  });
  fireEvent.change(screen.getByLabelText("Departure time"), {
    target: { value: "23:30" },
  });
}

test("validates required fields and focuses the first error", async () => {
  const { user, fetcher } = openApp();
  await user.click(screen.getByRole("button", { name: "Calculate route" }));
  const origin = screen.getByRole("combobox", { name: "Starting location" });
  expect(origin).toHaveFocus();
  expect(origin).toHaveAccessibleDescription(
    "Select a starting location from the suggestions.",
  );
  expect(screen.getByLabelText("Departure date")).toBeInvalid();
  expect(screen.getByLabelText("Departure time")).toBeInvalid();
  expect(fetcher).not.toHaveBeenCalled();
});

test("invalidates a previous location selection when edited", async () => {
  const { user, fetcher } = openApp();
  await fillTrip(user);
  await user.type(
    screen.getByRole("combobox", { name: "Starting location" }),
    " edited",
  );
  await user.click(screen.getByRole("button", { name: "Calculate route" }));
  expect(
    screen.getByRole("combobox", { name: "Starting location" }),
  ).toBeInvalid();
  expect(fetcher).not.toHaveBeenCalled();
});

test("submits selected places and a local departure, then displays and edits the route", async () => {
  const { user, fetcher } = openApp();
  await fillTrip(user);
  const addStop = screen.getByRole("button", { name: "Add a stop" });
  await user.click(addStop);
  expect(screen.getByLabelText("Stop 1 (optional)")).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Remove stop 1" }));
  expect(addStop).toHaveFocus();
  await user.click(addStop);
  await choosePlace(user, "Stop 1 (optional)", "Val", stop);

  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await user.click(screen.getByRole("button", { name: "Calculate route" }));
  expect(screen.getByText("Loading driving route.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Calculating route…" }),
  ).toBeDisabled();

  const call = fetcher.mock.lastCall;
  expect(call?.[0]).toBe("/api/routes");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    origin: start,
    destination: end,
    waypoints: [stop],
    departureLocal: "2030-06-15T23:30",
  });
  finish(Response.json(result));

  expect(
    await screen.findByRole("heading", { name: "Trip results" }),
  ).toBeVisible();
  expect(screen.getByRole("main")).toHaveFocus();
  expect(screen.getByText("Valdosta, GA")).toBeVisible();
  expect(screen.getByText("300.1 mi")).toBeVisible();
  expect(screen.getByText("5 hr 0 min")).toBeVisible();
  for (const arrival of screen.getAllByText(/Jun 16, 2030.*4:30 AM/)) {
    expect(arrival).toHaveAttribute("datetime", result.arrivalUtc);
  }
  await user.click(screen.getByRole("link", { name: "Edit trip" }));
  expect(screen.getByLabelText("Stop 1 (optional)")).toHaveValue(stop.address);
  expect(screen.getByLabelText("Departure date")).toHaveValue("2030-06-15");
  expect(screen.getByLabelText("Departure time")).toHaveValue("23:30");
});

test("shows API errors and preserves the trip for retry", async () => {
  const { user, fetcher } = openApp();
  fetcher.mockResolvedValueOnce(
    Response.json(
      { error: { message: "No driving route found." } },
      { status: 422 },
    ),
  );
  await fillTrip(user);
  await user.click(screen.getByRole("button", { name: "Calculate route" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No driving route found.",
  );
  expect(screen.getByLabelText("Destination")).toHaveValue(end.address);
  await user.click(screen.getByRole("button", { name: "Calculate route" }));
  expect(
    await screen.findByRole("heading", { name: "Trip results" }),
  ).toBeVisible();
});

test("cancels a pending route calculation when leaving the planner", async () => {
  const { user, fetcher } = openApp();
  fetcher.mockImplementationOnce(
    (_, options) =>
      new Promise((_, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
      }),
  );
  await fillTrip(user);
  await user.click(screen.getByRole("button", { name: "Calculate route" }));
  await user.click(screen.getByRole("link", { name: "Saved trips" }));
  expect(screen.getByRole("heading", { name: "Saved trips" })).toBeVisible();
  expect(fetcher.mock.lastCall?.[1]?.signal?.aborted).toBe(true);
});

test("provides a results fallback and exposes the active page in navigation", async () => {
  const { user } = openApp("/results");
  await user.click(screen.getByRole("link", { name: "Open trip planner" }));
  expect(screen.getByRole("heading", { name: "Plan your trip" })).toBeVisible();
  const about = screen.getByRole("link", { name: "About" });
  await user.click(about);
  expect(about).toHaveAttribute("aria-current", "page");
  expect(
    screen.getByRole("heading", { name: "About RainCheck" }),
  ).toBeVisible();
});
