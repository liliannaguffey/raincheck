# RainCheck

RainCheck is a road-trip weather planner in development. It will estimate when drivers reach points along a route and match those arrival times to local forecasts.

The trip planner uses Google Maps to calculate driving routes and estimated arrivals from a selected origin, destination, optional stops, and departure time. The [development plan](docs/DEVELOPMENT_PLAN.md) tracks forecast integration, departure recommendations, and trip persistence.

## Local development

Use Node.js 24 with npm. From the repository root, install dependencies with `npm ci`. Route planning requires the Google configuration below. The API health check and automated tests run without API keys or a database.

Start the API and client in separate terminals.

```sh
npm run dev:server
```

```sh
npm run dev:client
```

Open [RainCheck](http://127.0.0.1:5173). The Express API listens on port 3001 by default and returns `{"status":"ok"}` at `GET /api/health`. Vite proxies `/api` to Express during development.

## Configure Google Maps

1. Create or select a [Google Cloud project](https://console.cloud.google.com/) and [attach a billing account](https://developers.google.com/maps/get-started). Enable **Maps JavaScript API**, **Places API (New)**, **Routes API**, and **Time Zone API** in **APIs & Services**.
2. Under **APIs & Services → Credentials**, create a browser key. Add a **Websites** restriction with `http://127.0.0.1:5173/*` for the default local URL and the exact referrers for other environments. Restrict its APIs to **Maps JavaScript API** and **Places API (New)**.
3. Create a separate server key. Restrict its APIs to **Routes API** and **Time Zone API**. Use an IP-address restriction for a known server egress address. Keep server credentials out of the client environment and source control.
4. Copy `client/.env.example` and `server/.env.example` to `client/.env` and `server/.env`. Set `VITE_GOOGLE_MAPS_API_KEY` in the client and `GOOGLE_MAPS_SERVER_API_KEY` in the server. If the API port changes, update `API_PROXY_TARGET` to match. Restart both development servers after editing the files.
5. Optionally create a JavaScript [map ID](https://developers.google.com/maps/documentation/javascript/advanced-markers/start) and set `VITE_GOOGLE_MAP_ID`. The default Google demo map ID supports local testing. Use a project map ID for production.

To verify live, select a suggestion in each required location field, choose a future departure in the origin's local time, and calculate the route. Check the route line, markers, distance, duration, and endpoint-local time labels. The project’s automated checks stub provider calls, so they incur no Google API charges.

Autocomplete waits for three characters and a short pause, with a session token per input session. A completed route uses one Routes request, an origin Time Zone lookup, and up to one lookup per distinct named stop or destination. Configure billing budgets and API quotas in Google Cloud. Review [Google’s key restrictions](https://developers.google.com/maps/api-security-best-practices) and [Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies) before a public deployment, including the need for public terms and a privacy policy. Keep the prototype API local until you have controls on public access and usage.

See [route sampling](docs/ROUTE_SAMPLING.md) for arrival calculations, the distance fallback, and the opt-in sample visualization.

## Checks

```sh
npm run lint
npm run format:check
npm run build
npm test
```

To run the compiled API after building, use `npm run start -w @raincheck/server`. The static client build is in `client/dist`. Serve it from a host that serves `index.html` for client routes and forwards `/api` to Express.

## Project structure

| Directory | Responsibility                                              |
| --------- | ----------------------------------------------------------- |
| `client/` | React, TypeScript, Vite, and Tailwind CSS                   |
| `server/` | Express REST API and Vitest/Supertest integration tests     |
| `shared/` | TypeScript contracts shared across application boundaries   |
| `docs/`   | Development phases, decisions, and integration requirements |
