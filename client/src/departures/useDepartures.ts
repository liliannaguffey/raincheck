import type {
  DepartureFlexibility,
  DepartureRequest,
  DepartureResponse,
  RouteErrorResponse,
  RouteResponse,
} from "@raincheck/shared";
import { useEffect, useState } from "react";

export const defaultFlexibility = {
  hours: 3,
  direction: "either",
} as const satisfies DepartureFlexibility;

type Comparison = {
  settings: DepartureFlexibility;
  response?: DepartureResponse;
  error?: string;
};

export function useDepartures(result: RouteResponse, enabled: boolean) {
  const [request, setRequest] = useState(() => ({
    settings: defaultFlexibility as DepartureFlexibility,
  }));
  const [comparison, setComparison] = useState<
    Comparison & { request: typeof request }
  >();

  useEffect(() => {
    if (!enabled || !request.settings.hours) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const body: DepartureRequest = {
        departureUtc: result.departureUtc,
        samples: result.samples,
        flexibility: request.settings,
      };
      try {
        const response = await fetch("/api/departures/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as
          DepartureResponse | RouteErrorResponse | null;
        if (!response.ok || !data || !("recommendations" in data)) {
          throw new Error(
            data && "error" in data
              ? data.error.message
              : "Departure times could not be compared. Try again.",
          );
        }
        if (!controller.signal.aborted)
          setComparison({
            request,
            settings: request.settings,
            response: data,
          });
      } catch (error) {
        if (!controller.signal.aborted) {
          setComparison({
            request,
            settings: request.settings,
            error:
              error instanceof Error && !(error instanceof TypeError)
                ? error.message
                : "Departure times could not be compared. Try again.",
          });
        }
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, request, result]);

  const current = comparison?.request === request ? comparison : undefined;
  return {
    response: current?.response,
    error: current?.error,
    pending: enabled && request.settings.hours > 0 && !current,
    settings: request.settings,
    compare(settings: DepartureFlexibility) {
      setRequest({ settings });
    },
  };
}
