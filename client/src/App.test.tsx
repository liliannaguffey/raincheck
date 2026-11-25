// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { loadMockPreview } from "./trips/mockPreview";

vi.mock(import("./trips/mockPreview"), async (importOriginal) => {
  const original = await importOriginal();
  return { loadMockPreview: vi.fn(original.loadMockPreview) };
});

afterEach(() => {
  cleanup();
  vi.mocked(loadMockPreview).mockReset();
  vi.restoreAllMocks();
});

function openApp(path = "/") {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return user;
}

async function fillTrip(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Starting location"),
    "Gainesville, FL",
  );
  await user.type(screen.getByLabelText("Destination"), "Atlanta, GA");
  fireEvent.change(screen.getByLabelText("Departure date"), {
    target: { value: "2030-06-15" },
  });
  fireEvent.change(screen.getByLabelText("Departure time"), {
    target: { value: "23:30" },
  });
}

test("marks required fields, focuses the first error, and rejects identical endpoints", async () => {
  const user = openApp();
  const origin = screen.getByLabelText("Starting location");
  const destination = screen.getByLabelText("Destination");

  await user.click(screen.getByRole("button", { name: "Preview trip" }));
  expect(origin).toHaveFocus();
  expect(origin).toHaveAccessibleDescription("Enter a starting location.");
  expect(screen.getByLabelText("Departure date")).toBeInvalid();
  expect(screen.getByLabelText("Departure time")).toBeInvalid();

  await user.type(origin, "Gainesville");
  await user.type(destination, "gainESVILLE");
  await user.click(screen.getByRole("button", { name: "Preview trip" }));
  expect(destination).toHaveFocus();
  expect(destination).toHaveAccessibleDescription(
    "Choose a destination different from your starting location.",
  );
  expect(loadMockPreview).not.toHaveBeenCalled();
});

test("adds and removes stops, previews weather across midnight, and restores the trip for editing", async () => {
  const user = openApp();
  await fillTrip(user);
  const addStop = screen.getByRole("button", { name: "Add a stop" });

  await user.click(addStop);
  const temporaryStop = screen.getByLabelText("Stop 1 (optional)");
  expect(temporaryStop).toHaveFocus();
  await user.type(temporaryStop, "Temporary");
  await user.click(screen.getByRole("button", { name: "Remove stop 1" }));
  expect(addStop).toHaveFocus();
  expect(temporaryStop).not.toBeInTheDocument();
  await user.click(addStop);
  await user.type(screen.getByLabelText("Stop 1 (optional)"), "Valdosta, GA");

  await user.click(screen.getByRole("button", { name: "Preview trip" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading sample trip results.",
  );
  expect(
    screen.getByRole("button", { name: "Preparing preview…" }),
  ).toBeDisabled();

  expect(
    await screen.findByRole("heading", { name: "Trip results" }),
  ).toBeVisible();
  expect(screen.getByText("Sample weather data.")).toBeVisible();
  expect(screen.getByText("Valdosta, GA")).toBeVisible();
  expect(screen.getByRole("main")).toHaveFocus();
  expect(loadMockPreview).toHaveBeenCalledWith(
    {
      origin: "Gainesville, FL",
      destination: "Atlanta, GA",
      waypoints: ["Valdosta, GA"],
      departureUtc: new Date(2030, 5, 15, 23, 30).toISOString(),
    },
    expect.any(AbortSignal),
  );
  expect(screen.getByText("Light rain").previousElementSibling).toHaveAttribute(
    "datetime",
    new Date(2030, 5, 16, 0, 30).toISOString(),
  );

  await user.click(screen.getByRole("link", { name: "Edit trip" }));
  expect(screen.getByLabelText("Starting location")).toHaveValue(
    "Gainesville, FL",
  );
  expect(screen.getByLabelText("Destination")).toHaveValue("Atlanta, GA");
  expect(screen.getByLabelText("Stop 1 (optional)")).toHaveValue(
    "Valdosta, GA",
  );
  expect(screen.getByLabelText("Departure date")).toHaveValue("2030-06-15");
  expect(screen.getByLabelText("Departure time")).toHaveValue("23:30");
});

test("offers a retry and preserves entries after a preview error", async () => {
  vi.mocked(loadMockPreview).mockRejectedValueOnce(
    new Error("Preview unavailable"),
  );
  const user = openApp();
  await fillTrip(user);

  await user.click(screen.getByRole("button", { name: "Preview trip" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The trip preview could not load. Try again.",
  );
  expect(screen.getByLabelText("Destination")).toHaveValue("Atlanta, GA");
  await user.click(screen.getByRole("button", { name: "Preview trip" }));
  expect(
    await screen.findByRole("heading", { name: "Trip results" }),
  ).toBeVisible();
});

test("cancels a pending preview when leaving the planner", async () => {
  vi.mocked(loadMockPreview).mockImplementationOnce(
    (_, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const user = openApp();
  await fillTrip(user);
  await user.click(screen.getByRole("button", { name: "Preview trip" }));
  const signal = vi.mocked(loadMockPreview).mock.lastCall?.[1];

  await user.click(screen.getByRole("link", { name: "Saved trips" }));
  expect(screen.getByRole("heading", { name: "Saved trips" })).toBeVisible();
  expect(signal?.aborted).toBe(true);
});

test("provides a results fallback and exposes the active page in navigation", async () => {
  const user = openApp("/results");

  expect(screen.getByRole("heading", { name: "Trip results" })).toBeVisible();
  await user.click(screen.getByRole("link", { name: "Open trip planner" }));
  expect(screen.getByRole("heading", { name: "Plan your trip" })).toBeVisible();

  const aboutLink = screen.getByRole("link", { name: "About" });
  await user.click(aboutLink);
  expect(aboutLink).toHaveAttribute("aria-current", "page");
  expect(
    screen.getByRole("heading", { name: "About RainCheck" }),
  ).toBeVisible();
});
