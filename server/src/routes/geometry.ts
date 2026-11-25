import type { RouteCoordinate } from "@raincheck/shared";

const radians = Math.PI / 180;
const earthRadiusMeters = 6_371_008.8;

export function isCoordinate(value: unknown): value is RouteCoordinate {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Partial<RouteCoordinate>;
  return (
    typeof lat === "number" &&
    Math.abs(lat) <= 90 &&
    typeof lng === "number" &&
    Math.abs(lng) <= 180
  );
}

function distance(a: RouteCoordinate, b: RouteCoordinate) {
  const value =
    Math.sin(((b.lat - a.lat) * radians) / 2) ** 2 +
    Math.cos(a.lat * radians) *
      Math.cos(b.lat * radians) *
      Math.sin(((b.lng - a.lng) * radians) / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, value)));
}

export function measurePath(path: RouteCoordinate[]) {
  const start = path[0];
  if (!start || path.some((point) => !isCoordinate(point))) {
    throw new RangeError("Invalid route geometry");
  }

  const edges: {
    a: RouteCoordinate;
    b: RouteCoordinate;
    end: number;
    length: number;
  }[] = [];
  let length = 0;
  let previous = start;
  for (const point of path.slice(1)) {
    const span = distance(previous, point);
    if (span > 0) {
      length += span;
      edges.push({ a: previous, b: point, end: length, length: span });
    }
    previous = point;
  }

  return {
    length,
    at(fraction: number): RouteCoordinate {
      if (fraction <= 0 || !length) return start;
      if (fraction >= 1) return previous;
      const offset = length * fraction;
      const edge = edges.find(({ end }) => end >= offset);
      if (!edge) return previous;
      const t = (offset - (edge.end - edge.length)) / edge.length;
      const deltaLng = ((edge.b.lng - edge.a.lng + 540) % 360) - 180;
      return {
        lat: edge.a.lat + (edge.b.lat - edge.a.lat) * t,
        lng: ((edge.a.lng + deltaLng * t + 540) % 360) - 180,
      };
    },
  };
}

export function decodePolyline(encoded: string): RouteCoordinate[] {
  let cursor = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: RouteCoordinate[] = [];

  function delta() {
    let value = 0;
    for (let shift = 0; shift <= 25 && cursor < encoded.length; shift += 5) {
      const digit = encoded.charCodeAt(cursor++) - 63;
      if (digit < 0 || digit > 63) break;
      value += (digit & 31) * 2 ** shift;
      if (digit < 32) return value % 2 ? -(value + 1) / 2 : value / 2;
    }
    throw new RangeError("Malformed route polyline");
  }

  while (cursor < encoded.length) {
    lat += delta();
    lng += delta();
    const point = { lat: lat / 100_000, lng: lng / 100_000 };
    if (!isCoordinate(point))
      throw new RangeError("Invalid polyline coordinate");
    coordinates.push(point);
  }
  if (!coordinates.length) throw new RangeError("Empty route polyline");
  return coordinates;
}
