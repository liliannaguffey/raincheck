import type {
  RouteErrorResponse,
  RouteSample,
  RouteWeatherResponse,
} from "@raincheck/shared";

export async function fetchRouteWeather(
  samples: RouteSample[],
  signal: AbortSignal,
): Promise<RouteWeatherResponse> {
  const response = await fetch("/api/weather/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ samples }),
    signal,
  });
  const data = (await response.json().catch(() => null)) as
    RouteWeatherResponse | RouteErrorResponse | null;
  if (
    !response.ok ||
    !data ||
    !("points" in data) ||
    !Array.isArray(data.points)
  ) {
    throw new Error(
      data && "error" in data && data.error.message
        ? data.error.message
        : "Route weather could not be loaded. Try again.",
    );
  }
  if (data.points.length !== samples.length) {
    throw new Error(
      "RainCheck received incomplete weather results. Try again.",
    );
  }
  return data;
}
