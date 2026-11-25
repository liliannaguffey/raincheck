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

- Configure Maps JavaScript, Places, and Routes APIs. Add autocomplete, driving directions, route map, endpoint markers, distance, and duration.
- [x] Implement timed geometry interpolation, distance fallback, and origin-zone time utilities with unit tests.
- [x] Connect the Google providers and verify the route API with mocked responses.
- [x] Connect Places autocomplete, the planner, and the driving route summary.
- [ ] Render the interactive map and debug markers.
- [ ] Verify live calls with configured Google credentials.

## Phase 4 — Weather API integration

- Integrate OpenWeather in the backend and expose normalized forecast results through REST.
- Match arrival times to available provider intervals and handle forecast coverage and missing data.
- Show point forecasts and details on the map and test against mocked provider responses.

## Phase 5 — Weather severity and filters

- Configure and document severity thresholds. Detect weather hazards and consider terrain where supported by both elevation and weather data.
- Add severity overlays, legends, alerts, accessible status text, and local filters for rain, snow, fog, thunderstorms, and high winds.
- Test severity and filtering.

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
