import type {
  RouteResponse,
  RouteWeatherPoint,
  RouteWeatherSegment,
} from "@raincheck/shared";
import { useEffect, useRef, useState } from "react";
import { onMapsAuthFailure } from "../maps/google";
import { drawRoute } from "../maps/routeMap";

const debug = import.meta.env.VITE_ROUTE_DEBUG === "true";

export function RouteMap({
  result,
  weatherPoints,
  selectedWeather,
  onWeatherSelect,
  sections,
  highlightedSections,
}: {
  result: RouteResponse;
  weatherPoints?: RouteWeatherPoint[];
  selectedWeather?: string;
  onWeatherSelect?: (id: string) => void;
  sections?: RouteWeatherSegment[];
  highlightedSections?: ReadonlySet<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const weatherLayer = useRef<Awaited<ReturnType<typeof drawRoute>>>(null);
  const [state, setState] = useState<"pending" | "ready" | "error">("pending");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const controller = new AbortController();
    const off = onMapsAuthFailure(() => {
      controller.abort();
      setState("error");
    });
    void drawRoute(element, result, debug, controller.signal).then(
      (weather) => {
        if (controller.signal.aborted) return;
        weatherLayer.current = weather;
        setState("ready");
      },
      () => {
        if (!controller.signal.aborted) setState("error");
      },
    );
    return () => {
      off();
      controller.abort();
      weatherLayer.current = null;
    };
  }, [result]);

  useEffect(() => {
    if (state === "ready")
      weatherLayer.current?.setPoints(weatherPoints ?? [], onWeatherSelect);
  }, [state, weatherPoints, onWeatherSelect]);

  useEffect(() => {
    if (state === "ready") weatherLayer.current?.select(selectedWeather);
  }, [state, weatherPoints, selectedWeather]);

  useEffect(() => {
    if (state === "ready") weatherLayer.current?.setSections(sections ?? []);
  }, [state, sections]);

  useEffect(() => {
    if (state === "ready")
      weatherLayer.current?.highlightSections(highlightedSections);
  }, [state, sections, highlightedSections]);

  return (
    <div className="relative mt-4 h-80 overflow-hidden rounded-xl border border-line bg-canvas sm:h-104">
      <div
        ref={ref}
        className="absolute inset-0"
        role="region"
        aria-label="Interactive driving route map"
        aria-hidden={state !== "ready"}
      />
      {state !== "ready" && (
        <p
          role={state === "error" ? "alert" : "status"}
          className="absolute inset-0 grid place-items-center bg-canvas p-6 text-center text-sm text-muted"
        >
          {state === "error"
            ? "The Google map could not load. Check Maps setup or reload the page. Trip details are still available."
            : "Loading Google map…"}
        </p>
      )}
    </div>
  );
}
