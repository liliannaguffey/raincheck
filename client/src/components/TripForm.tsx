import type { RoutePlace, RouteRequest } from "@raincheck/shared";
import { ArrowRight, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { calculateRoute } from "../trips/routes";
import { Field } from "./Field";
import { LocationField } from "./LocationField";
import { Button } from "./ui";

export function TripForm({ initialTrip }: { initialTrip?: RouteRequest }) {
  const navigate = useNavigate();
  const [stops, setStops] = useState(
    () => initialTrip?.waypoints.map((_, index) => index) ?? [],
  );
  const nextStop = useRef(stops.length);
  const addedStop = useRef<number | null>(null);
  const addStopButton = useRef<HTMLButtonElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [places, setPlaces] = useState<Record<string, RoutePlace | undefined>>(
    () => ({
      origin: initialTrip?.origin,
      destination: initialTrip?.destination,
      ...Object.fromEntries(
        initialTrip?.waypoints.map((place, index) => [
          `stop-${index}`,
          place,
        ]) ?? [],
      ),
    }),
  );
  function setPlace(id: string, place?: RoutePlace) {
    setPlaces((current) => ({ ...current, [id]: place }));
    setErrors((current) => {
      if (!current[id]) return current;
      const updated = { ...current };
      delete updated[id];
      return updated;
    });
    setFailure("");
  }
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const focusError = useRef(false);
  const [date, time] = initialTrip?.departureLocal.split("T") ?? [];

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!focusError.current) return;
    focusError.current = false;
    form.current
      ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors]);

  useEffect(() => {
    if (addedStop.current !== null) {
      form.current
        ?.querySelector<HTMLInputElement>(`#stop-${addedStop.current}`)
        ?.focus();
      addedStop.current = null;
    }
  }, [stops]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;

    const data = new FormData(event.currentTarget);
    const read = (name: string) => String(data.get(name) ?? "").trim();
    const { origin, destination } = places;
    const departureDate = read("date");
    const departureTime = read("time");
    const fieldErrors: Record<string, string> = {};
    const waypoints: RoutePlace[] = [];

    if (!origin)
      fieldErrors.origin = "Select a starting location from the suggestions.";
    if (!destination) {
      fieldErrors.destination = "Select a destination from the suggestions.";
    } else if (origin?.placeId === destination.placeId) {
      fieldErrors.destination =
        "Choose a destination different from your starting location.";
    }
    for (const stop of stops) {
      const id = `stop-${stop}`;
      const place = places[id];
      if (place) waypoints.push(place);
      else if (read(id))
        fieldErrors[id] =
          "Select a stop from the suggestions or leave it blank.";
    }
    if (!departureDate) fieldErrors.date = "Choose a departure date.";
    if (!departureTime) fieldErrors.time = "Choose a departure time.";

    focusError.current = Object.keys(fieldErrors).length > 0;
    setErrors(fieldErrors);
    setFailure("");
    if (!origin || !destination || Object.keys(fieldErrors).length) return;

    const controller = new AbortController();
    request.current = controller;
    setPending(true);

    try {
      const trip = {
        origin,
        destination,
        waypoints,
        departureLocal: `${departureDate}T${departureTime}`,
      };
      const result = await calculateRoute(trip, controller.signal);
      if (!controller.signal.aborted) {
        void navigate("/results", { state: { trip, result } });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailure(
          error instanceof Error
            ? error.message
            : "The route could not be calculated. Try again.",
        );
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <form className="mt-5" onSubmit={submit} noValidate ref={form}>
      <fieldset className="grid min-w-0 gap-4" disabled={pending}>
        <legend className="sr-only">Trip details</legend>
        <LocationField
          id="origin"
          label="Starting location"
          placeholder="e.g. Gainesville, FL"
          selected={places.origin}
          onSelection={(place) => setPlace("origin", place)}
          error={errors.origin}
          required
        />
        {stops.map((stop, index) => (
          <div
            key={stop}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
          >
            <LocationField
              id={`stop-${stop}`}
              label={`Stop ${index + 1} (optional)`}
              selected={places[`stop-${stop}`]}
              error={errors[`stop-${stop}`]}
              onSelection={(place) => setPlace(`stop-${stop}`, place)}
            />
            <Button
              tone="secondary"
              aria-label={`Remove stop ${index + 1}`}
              onClick={() => {
                setStops(stops.filter((id) => id !== stop));
                setPlace(`stop-${stop}`);
                addStopButton.current?.focus();
              }}
            >
              <X size={17} aria-hidden="true" />
            </Button>
          </div>
        ))}
        <LocationField
          id="destination"
          label="Destination"
          placeholder="e.g. Atlanta, GA"
          selected={places.destination}
          onSelection={(place) => setPlace("destination", place)}
          error={errors.destination}
          required
        />
        <Button
          className="justify-self-start"
          tone="quiet"
          ref={addStopButton}
          disabled={stops.length >= 8}
          onClick={() => {
            const id = nextStop.current++;
            addedStop.current = id;
            setStops([...stops, id]);
          }}
        >
          <Plus size={17} aria-hidden="true" /> Add a stop
        </Button>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="departure-date"
            name="date"
            label="Departure date"
            type="date"
            defaultValue={date}
            error={errors.date}
            required
          />
          <Field
            id="departure-time"
            name="time"
            label="Departure time"
            type="time"
            defaultValue={time}
            error={errors.time}
            aria-describedby="departure-zone"
            required
          />
        </div>
        <p id="departure-zone" className="text-sm text-muted">
          Enter a future departure time in the starting location’s time zone.
        </p>
        <Button type="submit" className="justify-self-start">
          {pending ? "Calculating route…" : "Calculate route"}
          {!pending && <ArrowRight size={18} aria-hidden="true" />}
        </Button>
      </fieldset>
      <p
        role="status"
        className={pending ? "mt-3 text-sm text-muted" : "sr-only"}
      >
        {pending && "Loading driving route."}
      </p>
      {failure && (
        <p role="alert" className="field-error mt-3">
          {failure}
        </p>
      )}
    </form>
  );
}
