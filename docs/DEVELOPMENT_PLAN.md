# RainCheck development plan

## Phase 1 — Repository setup and architecture

- [x] Inspect the local folder and designated GitHub repository.
- [x] Initialize the empty repository on develop and configure origin.
- [x] Set up React, TypeScript, Vite, and Tailwind in client.
- [x] Set up Express and TypeScript in server, with a typed health endpoint.
- [x] Establish shared contracts, npm workspaces, and startup scripts.
- [x] Add ESLint, Prettier, environment templates, and initial README.
- [x] Verify development startup, production build, lint, formatting, and tests.
- Published the planning and frontend milestones to origin/develop. The phase closeout includes a final push and remote commit verification.

## Phase 2 — Frontend foundation

- [x] Build the design system, shared layout, navigation, and routes for Planner, Results, Saved Trips, and About.
- [x] Add reusable form controls, origin and destination inputs, waypoints, date and time inputs, responsive layouts, and loading and error states.
- [x] Add clearly labeled mock results.
- [x] Add initial component tests and verify the phase.

Verification covered required fields, duplicate endpoints, waypoint controls, focus, loading, failure and retry, request cancellation, navigation, editing, and UTC conversion across midnight. Five frontend tests and the backend health test passed. Lint, formatting, and both production builds passed. Chrome smoke checks passed at 320 px and 1440 px.

The Saved Trips page explains the current availability of trip saving. The next phase adds Google Places autocomplete, driving routes, and an interactive map.

The preview interprets departure input in the device’s time zone, stores it as UTC, and displays it in device time. Origin-local time selection belongs to the Maps integration. Sample weather is independent of the submitted locations and dates.

## Phase 3 — Google Maps integration

- [x] Configure Maps JavaScript, Places API (New), Routes API, and Time Zone API.
- [x] Implement timed geometry interpolation, distance fallback, and origin-zone time utilities with unit tests.
- [x] Connect the Google providers and verify the route API with mocked responses.
- [x] Connect Places autocomplete, the planner, and the driving route summary.
- [x] Render the interactive map and optional debug markers.
- [x] Document Google API setup, usage, timing estimates, and interpolation in the README and [route sampling guide](ROUTE_SAMPLING.md).
- [x] Pass automated checks and Chrome smoke tests with mocked Google Maps.
- [x] Verify live Maps JavaScript, Places API (New), Routes, and Time Zone requests with two representative trips.

Phase 3 passed live provider verification. Lint, formatting, both production builds with TypeScript checks, 8 frontend tests, and 25 backend tests passed. Chrome smoke tests at 320 px and 1440 px exercised autocomplete, route submission, the map, and a sample marker with stubbed Google data. The running API returned the expected missing-key error. The route API takes an origin-local departure and returns UTC samples. Named stops use local time when Google returns a zone. Unresolved display zones use UTC. Estimates assume no additional stop time. The results page identifies routes with distance-based interpolation.

### Live sign-off status

- The sign-off run confirmed both local `.env` files exist and are ignored and untracked. The credential fields in the tracked templates are blank.
- Both development servers started. The direct API and Vite proxy returned healthy responses, and the running route endpoint returned the expected structured error with a missing server key. Chrome also verified the missing browser key message and observed zero outbound Google requests in that case.
- All 33 automated tests passed again, with zero failures. Lint, formatting, TypeScript checks, both production builds, and the Chrome smoke flow with stubbed Google providers passed.
- After both local key assignments were saved, Chrome completed live trips through all four Google APIs. Gainesville to Atlanta via Valdosta returned about 334 miles, 5 hours 20 minutes, and 13 samples. Gainesville to Pensacola returned about 344 miles, 4 hours 59 minutes, and 11 samples. Both used step-duration sampling.
- Live checks covered selecting origin, destination, and waypoint suggestions, invalidating a destination on edit, rendering Google Maps and opening a debug marker, and checking sample intervals, UTC arrivals, cumulative distances, uniqueness, and the destination sample. The Pensacola trip resolved `America/New_York` at departure and `America/Chicago` at arrival. The browser used Pacific time during testing to verify that Gainesville's departure was interpreted in Eastern time.
- Phase 3 is signed off. The shared `RouteSample` contract provides coordinates and estimated UTC arrival timestamps for Phase 4.

## Phase 4 — Weather API integration

- [x] Select OpenWeather 5 Day / 3 Hour Forecast, normalize weather fields, and test UTC forecast matching.
- [x] Add bounded caching, request deduplication, and the route weather REST endpoint.
- [x] Load route forecasts and display a chronological timeline with partial coverage and retry states.
- [x] Add interactive weather markers and map–timeline selection.
- [x] Pass lint, formatting, TypeScript checks, both builds, and automated tests.
- [x] Verify partial weather, marker details, timeline interaction, and selection without additional requests in Chrome with stubbed providers.
- [x] Document setup, forecast matching, and cost controls in the README and [weather integration guide](WEATHER_INTEGRATION.md).
- [x] Verify a live Gainesville-to-Atlanta forecast trip with OpenWeather.

Phase 4 is signed off. The automated suite passed 14 frontend and 62 backend tests. Chrome smoke checks passed at 320 px and 1440 px. After the OpenWeather key activated, a live 331-mile Gainesville-to-Atlanta trip returned forecasts for all 11 route samples. The live browser check confirmed UTC matching, separate arrival and forecast times, and forecast details on the Google map. A repeated lookup for one sample reused the cached series. Weather coverage is limited to provider-supplied three-hour slots, with a 90-minute match tolerance. Weather severity and alternative departure logic are later phases.

## Phase 5 — Weather severity and filters

- [x] Classify forecasts using centralized thresholds and retain individual hazard evidence.
- [x] Segment existing road geometry and summarize weather coverage and exposure.
- [ ] Render route colors, grouped advisories, severity indicators, and local weather filters.
- [ ] Run automated and live verification.
- Terrain assessment is pending confirmed Elevation API configuration and budget approval.

## Phase 6 — Departure time optimization

- Evaluate departures within a configurable window starting at ±3 hours and reuse forecasts across candidates.
- Document and test exposure scoring. Present comparable options, hazard differences, uncertainty, and cases with no meaningful improvement.

## Phase 7 — PostgreSQL and saved trips

- Configure Prisma, PostgreSQL, and migrations. Model trip timestamps, waypoints, route references, and future ownership.
- Implement protected single-user persistence and create, reopen, edit, and delete flows.
- Validate requests, test database operations, and document local setup and access limitations.

## Phase 8 — Performance, testing, and refinement

- Refine forecast caching, expiry, deduplication, request concurrency, and route reuse.
- Test long trips, midnight and time zone crossings, partial forecasts, invalid inputs, and provider failures.
- Improve loading, responsive behavior, accessibility, and maintainability.

## Phase 9 — Portfolio readiness

- Finalize setup, architecture, algorithms, API dependencies, limitations, and technical challenges in project documentation.
- Add GitHub Actions for lint, tests, and builds. Verify production builds and document deployment prerequisites.

## Technical decisions and external requirements

- Phase 1 runs locally without provider credentials or a database.
- Phase 3 requires separate browser and server Google Maps credentials, with API and browser referrer restrictions where applicable.
- Phase 4 requires an OpenWeather key and a configured forecast endpoint. Available intervals and coverage depend on the endpoint.
- Phase 7 requires a PostgreSQL connection and access controls for saved trips.

## Phase 1 verification

- Vite served the starter page and transformed React source. Express returned HTTP 200 with the expected JSON directly and through the Vite proxy.
- ESLint, Prettier, the frontend and backend production builds, and the Vitest/Supertest health check passed.
- Known issues: none found in the Phase 1 scaffold. The trip planning interface and mocked results are Phase 2 work.
