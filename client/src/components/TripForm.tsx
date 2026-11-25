import { ArrowRight, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { loadMockPreview } from "../trips/mockPreview";
import { departureFields, parseDeparture } from "../trips/preview";
import type { TripPreviewRequest } from "../trips/preview";
import { Field } from "./Field";
import { Button } from "./ui";

type Errors = Partial<
  Record<"origin" | "destination" | "date" | "time", string>
>;

export function TripForm({
  initialTrip,
}: {
  initialTrip?: TripPreviewRequest;
}) {
  const navigate = useNavigate();
  const [stops, setStops] = useState(
    () => initialTrip?.waypoints.map((_, index) => index) ?? [],
  );
  const nextStop = useRef(stops.length);
  const addedStop = useRef<number | null>(null);
  const addStopButton = useRef<HTMLButtonElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const { date, time } = departureFields(initialTrip?.departureUtc);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
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
    const origin = read("origin");
    const destination = read("destination");
    const departureDate = read("date");
    const departureTime = read("time");
    const departureUtc = parseDeparture(departureDate, departureTime);
    const fieldErrors: Errors = {};

    if (!origin) fieldErrors.origin = "Enter a starting location.";
    if (!destination) {
      fieldErrors.destination = "Enter a destination.";
    } else if (origin.toLowerCase() === destination.toLowerCase()) {
      fieldErrors.destination =
        "Choose a destination different from your starting location.";
    }
    if (!departureDate) fieldErrors.date = "Choose a departure date.";
    if (!departureTime) {
      fieldErrors.time = "Choose a departure time.";
    } else if (departureDate && !departureUtc) {
      fieldErrors.time =
        "Choose a valid date and time in your current time zone.";
    }

    setErrors(fieldErrors);
    if (!departureUtc || Object.keys(fieldErrors).length) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");

    try {
      const preview = await loadMockPreview(
        {
          origin,
          destination,
          departureUtc,
          waypoints: stops.map((stop) => read(`stop-${stop}`)).filter(Boolean),
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        void navigate("/results", { state: { preview } });
      }
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      request.current = null;
    }
  }

  return (
    <form className="mt-5" onSubmit={submit} noValidate ref={form}>
      <fieldset className="grid min-w-0 gap-4" disabled={status === "loading"}>
        <legend className="sr-only">Trip details</legend>
        <Field
          id="origin"
          name="origin"
          label="Starting location"
          placeholder="e.g. Gainesville, FL"
          defaultValue={initialTrip?.origin}
          error={errors.origin}
          maxLength={160}
          required
        />
        {stops.map((stop, index) => (
          <div
            key={stop}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
          >
            <Field
              id={`stop-${stop}`}
              name={`stop-${stop}`}
              label={`Stop ${index + 1} (optional)`}
              defaultValue={initialTrip?.waypoints[stop]}
              maxLength={160}
            />
            <Button
              tone="secondary"
              aria-label={`Remove stop ${index + 1}`}
              onClick={() => {
                setStops(stops.filter((id) => id !== stop));
                addStopButton.current?.focus();
              }}
            >
              <X size={17} aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Field
          id="destination"
          name="destination"
          label="Destination"
          placeholder="e.g. Atlanta, GA"
          defaultValue={initialTrip?.destination}
          error={errors.destination}
          maxLength={160}
          required
        />
        <Button
          className="justify-self-start"
          tone="quiet"
          ref={addStopButton}
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
          Preview times use your device’s time zone.
        </p>
        <Button type="submit" className="justify-self-start">
          {status === "loading" ? "Preparing preview…" : "Preview trip"}
          {status !== "loading" && <ArrowRight size={18} aria-hidden="true" />}
        </Button>
      </fieldset>
      <p
        role="status"
        className={status === "loading" ? "mt-3 text-sm text-muted" : "sr-only"}
      >
        {status === "loading" && "Loading sample trip results."}
      </p>
      {status === "error" && (
        <p role="alert" className="field-error mt-3">
          The trip preview could not load. Try again.
        </p>
      )}
    </form>
  );
}
