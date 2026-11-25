# Route weather integration

RainCheck retrieves a forecast series for each needed coordinate and matches each route sample to the forecast nearest its estimated arrival. Driving directions and weather load independently. The results page keeps the route visible while weather loads, when only part of a route has coverage, and when a provider request fails.

## Provider and setup

Phase 4 uses OpenWeather's [5 Day / 3 Hour Forecast](https://openweathermap.org/api/forecast5) at `GET /data/2.5/forecast`. It is included in the standard Free plan and accepts latitude and longitude. OpenWeather lists 60 calls per minute and 1 million calls per month for that plan. The separate One Call product offers finer forecast intervals and has its own metered subscription. RainCheck requires a standard Free plan key for this adapter. [OpenWeather pricing](https://openweathermap.org/price)

Create a free account, create or copy a key from [My API Keys](https://home.openweathermap.org/api_keys), and set `OPENWEATHER_API_KEY` in the ignored `server/.env`. Restart the API after saving it. An access-denied result can mean the key is invalid, is still activating, or lacks access to this endpoint. The client sends route points to RainCheck's API and receives normalized weather, while the provider key is used only by the backend.

## Request flow

1. The results page sends the route's existing `RouteSample[]` in a JSON object with a `samples` field to `POST /api/weather/route`.
2. The HTTP handler checks coordinate ranges, unique IDs, timestamps, required metadata, and valid time-zone identifiers. A request can include up to 256 points and 128 KB. Malformed input receives a structured 400 or 413 response.
3. The route weather service skips provider requests for arrivals beyond the five-day horizon or more than half a forecast interval in the past. It gets a forecast series from the per-location cache or the OpenWeather adapter for each remaining coordinate.
4. The adapter requests metric units and normalizes and sorts the API response. The matching module selects a forecast, and the service returns the enriched points in chronological order.

`ForecastProvider` defines series retrieval, forecast resolution, and horizon. A future OpenWeather adapter can implement that interface while reusing the cache, matcher, and route weather service. Provider credentials and endpoint URLs stay in their adapter.

## Data and forecast matching

`RouteWeatherResponse` identifies OpenWeather, the nominal horizon, and resolution in seconds. Every returned point keeps the original route sample ID, coordinates, estimated UTC arrival, elapsed driving time, cumulative distance, and optional name and time zone. Available points carry a normalized forecast, its UTC timestamp, its retrieval time, and a signed offset in seconds. A positive offset means the forecast timestamp is later than arrival.

The matcher chooses the closest actual forecast timestamp and prefers the earlier slot on ties. It accepts at most a 90-minute difference for the three-hour product. The first slot may cover the preceding 90 minutes. Arrival after the last supplied slot is outside coverage. Empty series and gaps where the closest slot is too distant are unavailable. Malformed provider responses, denied access, timeouts, and rate limits produce a structured failure code on affected points. A mixed response retains its successful points.

Weather values remain in provider metric units internally. Temperatures use Celsius, wind uses meters per second, visibility uses meters, and precipitation probability ranges from 0 to 1. Rain and snow totals, when present, are millimeters over the provider's three-hour accumulation period. Descriptions, IDs, icons, feels-like temperature, humidity, cloud cover, and wind direction are retained when supplied. Missing fields stay absent. The UI converts temperature to Fahrenheit, wind to mph, visibility to miles, and probability to percent.

Arrivals and forecast timestamps are matched in UTC across midnight and time-zone boundaries. The interface uses the sample's time zone where known and labels UTC otherwise. Route samples can be 30 minutes apart and still select the same three-hour forecast slot. Conditions and measurements come from that slot.

## Caching, limits, and verification

- The per-process memory cache holds up to 256 exact coordinate series. Matching different arrival times at the same coordinate reuses the same series. Simultaneous requests share one in-flight lookup.
- The default cache lifetime is 600 seconds. Choose 0 to disable storage or a value up to 3,600 seconds with `WEATHER_CACHE_TTL_SECONDS`. The cache respects provider cache directives and the latest forecast timestamp. Entries expire or are evicted in memory. There is no persistent archive.
- The server runs at most four OpenWeather requests concurrently and starts at most 50 in a rolling minute. It admits up to 512 unique active or queued lookups per process. Calls time out after six seconds. Access denials and rate limits pause new provider calls for one minute. Failed forecasts are eligible for later retries, and the server performs no automatic retries.
- A browser route change cancels its weather request and discards stale results. Map and timeline selections share client state and reuse the loaded forecasts. A weather retry can reuse available cached series.
- Forecast coverage varies by location and the returned timestamps. Large routes may hit the request-size or per-minute limits. Multiple server processes and other apps using the same key have separate local budgets. The UI attributes forecast data to OpenWeather. Review the terms that apply to your account before deployment. [OpenWeather licensing guide](https://openweathermap.org/storage/app/media/documents/License_explainer_25_Feb_25.pdf)
- Automated tests and the Chrome smoke flow use stubs. For a live check, configure a key and test one near-term Gainesville-to-Atlanta drive. Check the timestamps, units, map popups, and timeline. Retrying a failed point should preserve the driving route. Cached locations can serve subsequent requests within their TTL.

Phase 5 can consume normalized conditions and measurements to assign severity. Phase 6 can reuse a location's forecast series and match it against alternative UTC arrival times.
