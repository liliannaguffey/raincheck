import type { TripPreview, TripPreviewRequest } from "./preview";

export async function loadMockPreview(
  trip: TripPreviewRequest,
  signal: AbortSignal,
): Promise<TripPreview> {
  await new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 350);

    function abort() {
      clearTimeout(timeout);
      reject(signal.reason);
    }

    signal.addEventListener("abort", abort, { once: true });
  });

  return {
    trip,
    forecasts: [
      { elapsedMinutes: 0, condition: "Partly cloudy", temperatureF: 71 },
      { elapsedMinutes: 60, condition: "Light rain", temperatureF: 66 },
      { elapsedMinutes: 120, condition: "Cloudy", temperatureF: 68 },
    ],
  };
}
