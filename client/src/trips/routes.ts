import type {
  RouteErrorResponse,
  RouteRequest,
  RouteResponse,
} from "@raincheck/shared";

export async function calculateRoute(
  trip: RouteRequest,
  signal: AbortSignal,
): Promise<RouteResponse> {
  const response = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trip),
    signal,
  });
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as RouteErrorResponse | null;
    throw new Error(
      body?.error?.message || "The route could not be calculated. Try again.",
    );
  }
  const data = (await response.json()) as RouteResponse;
  if (!data?.route?.coordinates?.length || !data?.samples?.length) {
    throw new Error("RainCheck received incomplete route results. Try again.");
  }
  return data;
}

export function formatMiles(meters: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(meters / 1609.344)} mi`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

export function formatArrival(timestamp: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}
