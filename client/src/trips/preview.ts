export interface TripPreviewRequest {
  origin: string;
  destination: string;
  waypoints: string[];
  departureUtc: string;
}

export interface SampleForecast {
  elapsedMinutes: number;
  condition: string;
  temperatureF: number;
}

export interface TripPreview {
  trip: TripPreviewRequest;
  forecasts: SampleForecast[];
}

export function parseDeparture(date: string, time: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return;
  }

  const departure = new Date(`${date}T${time}`);
  if (Number.isNaN(departure.getTime())) return;

  const offset = departure.getTimezoneOffset() * 60_000;
  const wallTime = new Date(departure.getTime() - offset)
    .toISOString()
    .slice(0, 16);
  if (wallTime === `${date}T${time}`) return departure.toISOString();
}

export function departureFields(departureUtc?: string) {
  if (!departureUtc) return { date: "", time: "" };

  const departure = new Date(departureUtc);
  const offset = departure.getTimezoneOffset() * 60_000;
  const wallTime = new Date(departure.getTime() - offset).toISOString();
  return { date: wallTime.slice(0, 10), time: wallTime.slice(11, 16) };
}
