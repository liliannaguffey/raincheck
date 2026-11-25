# RainCheck

RainCheck is a road-trip planner that estimates when drivers reach points along a route and matches those arrival times to local forecasts.

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

### Live sign-off

1. Open the exact loopback URL allowed by the browser key. Choose an upcoming date at 8:00 AM Gainesville time. Select **Gainesville, FL** as the origin, **Atlanta, GA** as the destination, and **Valdosta, GA** as an optional stop. Check that the map fits the route, the line follows the driving directions, and the summary shows distance, duration, and estimated arrival.
2. Edit that trip, remove Valdosta, and change the destination to **Pensacola, FL**. Confirm that submitting an edited destination before selecting a suggestion prompts you to select one. Select Pensacola and calculate the route. Gainesville should display Eastern time and Pensacola should display Central time. Driving duration is the difference between the UTC timestamps.
3. With `VITE_ROUTE_DEBUG=true` set before starting Vite, select a sample marker to inspect its coordinates, UTC arrival when a point has no named time zone, elapsed time, and cumulative distance. Check that elapsed time and distance increase along the route and that the destination sample matches the final stop.

The automated checks stub provider calls and incur no Google API charges.

Autocomplete waits for three characters and a short pause, with a session token per input session. A completed route uses one Routes request, an origin Time Zone lookup, and up to one lookup per distinct named stop or destination. Configure billing budgets and API quotas in Google Cloud. Review [Google’s key restrictions](https://developers.google.com/maps/api-security-best-practices) and [Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies) before a public deployment, including the need for public terms and a privacy policy. Keep the prototype API local until you have controls on public access and usage.

See [route sampling](docs/ROUTE_SAMPLING.md) for arrival calculations, the distance fallback, and the opt-in sample visualization.

## Configure OpenWeather

1. Create a standard Free plan account and get a key from [My API Keys](https://home.openweathermap.org/api_keys). RainCheck uses the [5 Day / 3 Hour Forecast](https://openweathermap.org/api/forecast5), which is included in that plan. Separate metered One Call products can offer finer forecast intervals. [OpenWeather pricing](https://openweathermap.org/price)
2. Add `OPENWEATHER_API_KEY` to the ignored `server/.env`, alongside the existing Google Maps server configuration. Restart the API. Optionally set `WEATHER_CACHE_TTL_SECONDS` to configure the in-memory cache lifetime. The default is 600 seconds and 0 disables storage.
3. Plan one Gainesville-to-Atlanta trip departing tomorrow. Check that the route appears while weather loads, compare arrival and forecast times in the timeline, and select a weather marker. The displayed forecast uses OpenWeather’s three-hour time slots. Selecting a marker uses the loaded response.

`POST /api/weather/route` takes route samples and returns normalized forecasts matched to UTC arrival times. It reports partial and unavailable coverage while the driving route stays visible. Forecast requests share exact-coordinate series and use bounded concurrency, a rolling call budget, and timeouts. [Weather integration guide](docs/WEATHER_INTEGRATION.md)

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
