# Route sampling and arrival times

Weather forecasts for a trip need both a location and an arrival time. Two equal-length stretches can take different amounts of time when one follows city streets and the other follows a freeway. RainCheck samples by estimated driving time to capture that difference.

## From the planner to the route

1. Places Autocomplete (New) supplies a formatted address, place ID, and coordinates for each selected location. The client submits those selections with an origin-local date and time to `POST /api/routes`.
2. Express validates the trip. The server uses the selected origin coordinates to resolve an IANA time zone through Google's Time Zone API. Temporal converts the local departure to UTC and rejects skipped or repeated clock times at daylight-saving transitions. Choose a different time if the departure falls within one of those transitions.
3. The Routes API receives the UTC departure, place IDs, and optional waypoints. It returns a traffic-aware estimate with route and leg durations, distances, and encoded polylines. The adapter decodes geometry and normalizes distances to meters and durations to seconds.
4. The sampler returns the origin, destination, stops, and periodic points. The API supplies time zones for the named stops when available. The frontend renders the blue line and stop markers and formats the trip summary in endpoint-local times.

## How interpolation works

- The default interval is 1,800 seconds. The sampling function accepts a different interval for testing and future use.
- Route legs follow the selected stop order. Leg travel durations are scaled proportionally to reconcile their sum with the route total. Steps within each leg are weighted by their static durations, then scaled to fit that leg's traffic-aware duration. Google exposes traffic-aware duration at the route and leg levels. This weighting estimates how traffic affects time within each leg.
- For a time inside a step, the sampler converts the elapsed share into a share of that step's geometric length. It measures successive polyline edges with a great-circle distance formula, skips repeated coordinates, and interpolates along the chosen edge. It estimates cumulative distance using provider step distances when available, with geometric lengths as a fallback, and reconciles them with the leg total.
- A leg with incomplete step timing or unusable step geometry uses its full leg polyline and allocates time by geometric distance. This assumes a constant speed **within that leg**. Returned results flag when a driving leg uses this approximation.
- Named stops take precedence when an interval coincides with a leg boundary. The origin and destination are always included. Equivalent colocated stops at the same elapsed time may share a marker.

Each sample has an ID, coordinates, elapsed seconds, cumulative meters, point type, and an estimated UTC arrival calculated as **departure instant + elapsed driving time**. Named stops can also carry a display name and time zone. Adding elapsed time to UTC keeps estimates ordered through midnight, time-zone boundaries, daylight-saving changes, and multi-day trips. Phase 4 can consume the sample coordinates and UTC timestamps without resolving a time zone for every weather request.

## Limitations and verification

- Traffic changes, road closures, and time spent stopped can change actual arrival times. Google step durations provide relative weights and contain no step-specific traffic estimate in this integration. RainCheck assumes zero extra dwell time at stops.
- The server resolves the origin zone once, then attempts a time-zone lookup for named waypoints and destination. Repeated lookups for the same coordinates share a request. Intermediate samples have no time-zone lookup or reverse geocoding. The results and debug display use UTC when a zone is unavailable.
- Set `VITE_ROUTE_DEBUG=true` in `client/.env` and restart Vite to show sampled points. Select a marker to see coordinates, estimated arrival, elapsed time, and cumulative distance. Normal mode displays the route and named stops.
- Automated tests use local geometry and mocked Google results. Live validation requires the project keys described in the [README](../README.md).

Google documents provider behavior in the [Routes API](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [Time Zone API](https://developers.google.com/maps/documentation/timezone/requests-timezone), [Places Autocomplete Data API](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data).
