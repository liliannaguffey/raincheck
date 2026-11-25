import type { RouteSample, RouteWeatherResponse } from "@raincheck/shared";
import { useEffect, useState } from "react";
import { fetchRouteWeather } from "./api";

interface WeatherState {
  data?: RouteWeatherResponse;
  pending: boolean;
  error?: string;
}

export function useRouteWeather(samples: RouteSample[]) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WeatherState>({ pending: true });

  useEffect(() => {
    const request = new AbortController();
    // A discarded Strict Mode effect never sends a request.
    const start = window.setTimeout(() => {
      setState((previous) => ({ data: previous.data, pending: true }));
      void fetchRouteWeather(samples, request.signal).then(
        (data) => {
          if (!request.signal.aborted) setState({ data, pending: false });
        },
        (error: unknown) => {
          if (!request.signal.aborted) {
            setState((previous) => ({
              data: previous.data,
              pending: false,
              error:
                error instanceof TypeError || !(error instanceof Error)
                  ? "Route weather could not be loaded. Try again."
                  : error.message,
            }));
          }
        },
      );
    }, 0);
    return () => {
      window.clearTimeout(start);
      request.abort();
    };
  }, [samples, attempt]);

  return {
    ...state,
    retry() {
      setState((previous) => ({ data: previous.data, pending: true }));
      setAttempt((count) => count + 1);
    },
  };
}
