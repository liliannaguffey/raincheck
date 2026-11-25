import { Temporal } from "@js-temporal/polyfill";

export function localDepartureToUtc(departure: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departure)) {
    throw new RangeError("Departure must include a local date and time");
  }
  return Temporal.PlainDateTime.from(departure, { overflow: "reject" })
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}

export function arrivalAt(departureUtc: string, elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Invalid elapsed time");
  }

  return Temporal.Instant.from(departureUtc)
    .add({ milliseconds: Math.round(elapsedSeconds * 1000) })
    .toString();
}
