# RainCheck

RainCheck is a road-trip weather planner in development. It will estimate when drivers reach points along a route and match those arrival times to local forecasts.

The trip planner accepts a route, optional stops, and a departure date and time. Preview results use a fixed sample weather timeline and device-local times. The [development plan](docs/DEVELOPMENT_PLAN.md) tracks live routing, forecasts, departure recommendations, and trip persistence.

## Local development

Use Node.js 24 with npm. From the repository root, install dependencies with `npm ci`. The sample planner and API health check need no API keys or database.

Start the API and client in separate terminals.

```sh
npm run dev:server
```

```sh
npm run dev:client
```

Open [RainCheck](http://127.0.0.1:5173). The Express API listens on port 3001 by default and returns `{"status":"ok"}` at `GET /api/health`. Vite proxies `/api` to Express during development.

Copy each workspace's `.env.example` to `.env` when overriding defaults or enabling future integrations. If you change the API port, update the client proxy target as well. Browser variables prefixed with `VITE_` are public. Keep Google Maps server credentials, OpenWeather credentials, and the database URL in the server environment.

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
