import request from "supertest";
import { expect, test, vi } from "vitest";
import { createApp } from "../app.ts";
import { createRouteService } from "./service.ts";

const trip = {
  origin: {
    placeId: "origin",
    address: "Start",
    coordinate: { lat: 38.5, lng: -120.2 },
  },
  destination: {
    placeId: "destination",
    address: "Finish",
    coordinate: { lat: 40.7, lng: -120.95 },
  },
  departureLocal: "2030-06-15T23:30",
};
const polyline = { encodedPolyline: "_p~iF~ps|U_ulLnnqC" };
const payload = {
  routes: [
    {
      distanceMeters: 243000,
      duration: "7200s",
      polyline,
      legs: [
        {
          duration: "7200s",
          distanceMeters: 243000,
          polyline,
          startLocation: { latLng: { latitude: 38.5, longitude: -120.2 } },
          endLocation: { latLng: { latitude: 40.7, longitude: -120.95 } },
          steps: [
            { polyline, distanceMeters: 243000, staticDuration: "6000s" },
          ],
        },
      ],
    },
  ],
};

function mockGoogle(result: unknown = payload) {
  return vi.fn<typeof fetch>(async (url) => {
    if (url instanceof URL) {
      return Response.json({
        status: "OK",
        timeZoneId: url.searchParams.get("location")?.startsWith("38.5")
          ? "America/Los_Angeles"
          : "America/Denver",
      });
    }
    return result instanceof Response ? result : Response.json(result);
  });
}

function api(fetcher: typeof fetch, key = "test-placeholder") {
  return request(
    createApp(
      createRouteService({
        key,
        fetcher,
        now: () => Date.parse("2029-01-01T00:00:00Z"),
      }),
    ),
  );
}

test("calculates a traffic-aware route with normalized steps and arrivals in UTC", async () => {
  const google = mockGoogle();
  const response = await api(google).post("/api/routes").send(trip).expect(200);
  expect(response.body).toMatchObject({
    departureUtc: "2030-06-16T06:30:00Z",
    arrivalUtc: "2030-06-16T08:30:00Z",
    sampling: "step-duration",
    route: {
      trafficAware: true,
      distanceMeters: 243000,
      durationSeconds: 7200,
    },
  });
  expect(response.body.route.legs[0].steps[0]).toMatchObject({
    staticDurationSeconds: 6000,
    coordinates: [trip.origin.coordinate, trip.destination.coordinate],
  });
  expect(response.body.samples).toHaveLength(5);
  expect(response.body.samples[0].timeZone).toBe("America/Los_Angeles");
  expect(response.body.samples.at(-1).timeZone).toBe("America/Denver");
  expect(google).toHaveBeenCalledTimes(3);
  const options = google.mock.calls[1]?.[1];
  expect(JSON.parse(String(options?.body))).toMatchObject({
    origin: { placeId: "origin" },
    destination: { placeId: "destination" },
    departureTime: "2030-06-16T06:30:00Z",
    routingPreference: "TRAFFIC_AWARE",
  });
});

test.each([
  [{}, "INVALID_LOCATIONS"],
  [{ ...trip, destination: trip.origin }, "INVALID_LOCATIONS"],
  [{ ...trip, waypoints: [null] }, "INVALID_WAYPOINTS"],
  [{ ...trip, departureLocal: "2030-02-30T10:30" }, "INVALID_DEPARTURE"],
])(
  "rejects invalid trip inputs before requesting Google",
  async (input, code) => {
    const google = mockGoogle();
    const response = await api(google)
      .post("/api/routes")
      .send(input)
      .expect(400);
    expect(response.body.error.code).toBe(code);
    expect(google).not.toHaveBeenCalled();
  },
);

test("returns a structured error for malformed JSON", async () => {
  const response = await api(mockGoogle())
    .post("/api/routes")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
  expect(response.body.error.code).toBe("INVALID_REQUEST");
});

test("rejects past departure without calling Routes", async () => {
  const google = mockGoogle();
  const response = await api(google)
    .post("/api/routes")
    .send({ ...trip, departureLocal: "2028-03-05T12:00" })
    .expect(422);
  expect(response.body.error.code).toBe("INVALID_DEPARTURE");
  expect(google).toHaveBeenCalledTimes(1);
});

test("returns a configuration error without making requests", async () => {
  const google = mockGoogle();
  const response = await api(google, "")
    .post("/api/routes")
    .send(trip)
    .expect(503);
  expect(response.body.error.code).toBe("MAPS_NOT_CONFIGURED");
  expect(google).not.toHaveBeenCalled();
});

test.each([
  [{ routes: [] }, 422, "NO_ROUTE"],
  [{ routes: [{ duration: "oops" }] }, 502, "INVALID_PROVIDER_RESPONSE"],
  [new Response("", { status: 429 }), 429, "ROUTE_RATE_LIMIT"],
  [new Response("", { status: 500 }), 502, "PROVIDER_UNAVAILABLE"],
])(
  "maps provider errors to structured responses",
  async (payload, status, code) => {
    const response = await api(mockGoogle(payload))
      .post("/api/routes")
      .send(trip)
      .expect(status);
    expect(response.body.error.code).toBe(code);
  },
);

test("handles network errors without leaking provider details", async () => {
  const google = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("sensitive URL"));
  const response = await api(google).post("/api/routes").send(trip).expect(502);
  expect(response.body.error.code).toBe("PROVIDER_UNAVAILABLE");
  expect(JSON.stringify(response.body)).not.toContain("sensitive");
});
