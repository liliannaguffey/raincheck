# Weather severity and route advisories

RainCheck classifies normalized OpenWeather forecasts at each sampled arrival. The backend adds a classification and all supported hazards to the route weather response. The existing UTC arrival and forecast timestamps still drive matching. Elevation, actual road conditions, official warnings, and vehicle characteristics are outside this assessment.

## Classification and thresholds

`server/src/weather/severity.ts` exports the pure `classifyWeather` function and a single default threshold configuration. Tests and future callers can pass alternate thresholds and the represented accumulation interval. Threshold changes to the running application are made in the configuration in that module.

| Signal                 | Use caution                                                                        | Potentially hazardous                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Rain or drizzle        | Light rain or drizzle is caution. Average rates of at least 2.5 mm/h are moderate. | At least 7.6 mm/h average, or a heavy provider condition. At least 25 mm/h or a very heavy provider condition is labeled significant rainfall. |
| Snow                   | Snow forecast or measured positive accumulation.                                   | Heavy provider snow conditions or at least 2.5 mm/h average in the provider's snow accumulation units.                                         |
| Freezing precipitation | Liquid precipitation and forecast air temperature at or below 1 °C.                | A provider condition for freezing rain, sleet, or mixed rain and snow.                                                                         |
| Visibility             | Fog, mist, or another supported obscuration, or visibility at or below 1,609 m.    | Visibility at or below 402 m.                                                                                                                  |
| Sustained wind         | At least 11.2 m/s, roughly 25 mph.                                                 | At least 17.9 m/s, roughly 40 mph.                                                                                                             |
| Wind gusts             | At least 15.6 m/s, roughly 35 mph.                                                 | At least 20.6 m/s, roughly 46 mph.                                                                                                             |
| Thunderstorms          | —                                                                                  | Any provider thunderstorm. Heavy or ragged storm codes receive an additional description of stronger forecast activity.                        |

The rain breakpoints are approximately the rain intensity bands in the NWS observation handbook. The rate here is the reported three-hour total divided by three, so brief downpours can be much stronger than the displayed average. The 25 mm/h breakpoint and snow cutoff are RainCheck heuristics. OpenWeather reports rain and snow accumulation in millimeters for the previous three hours. RainCheck does not convert snowfall to road depth or assume a snow-to-liquid ratio. [NWS observation handbook](https://www.weather.gov/media/surface/WSOH8.pdf) · [OpenWeather forecast fields](https://openweathermap.org/api/forecast5)

The visibility and upper sustained wind thresholds use values close to examples in NWS Raleigh criteria. RainCheck uses the gust threshold as a conservative driving heuristic near the lower bound of that office's wind advisory gust range. It has no persistence, coverage, regional, or vehicle-specific criteria. The lower visibility and wind sensitivity thresholds are RainCheck heuristics. [NWS Raleigh criteria](https://www.weather.gov/rah/weathercriteria)

The near-freezing cutoff provides a one-degree margin when liquid precipitation is present. Air temperature alone does not establish surface ice. Thunderstorm and freezing-precipitation classifications use forecast condition codes. A thunderstorm classification does not establish that the storm meets official severe criteria. [NWS snow, ice, and cold guidance](https://www.weather.gov/ohx/wintersafetytips) · [OpenWeather condition codes](https://openweathermap.org/weather-conditions)

Provider condition codes take priority over text. If a code is absent, recognized descriptions can identify supported conditions. A precipitation probability can contextualize a rain advisory and never determines severity by itself. Invalid or absent measurements do not trigger numeric thresholds. Favorable requires a recognized benign weather condition plus valid wind and visibility, with no identified hazards. Known hazards remain visible with incomplete supporting data. Each result includes confidence-related completeness, the forecast availability, explanations, all hazard categories, and threshold evidence where applicable. The overall sample severity is the highest hazard level, without adding scores together.

## Map sections and route summary

The shared `@raincheck/shared/route-weather` module projects each ordered sample onto the driving polyline. Projection never moves backward along the path. Cumulative driving distance helps choose among nearly coincident paths on loops or switchbacks. Adjacent sections share the exact same boundary and keep the original road vertices between them. The section distance and driving time come from differences between cumulative sample totals. They are independent of the display polyline length.

If both endpoints are assessed, the worse classification colors the span. If either endpoint is unknown, the span is gray, and any known endpoint hazard still appears at its marker and in advisories. Gray includes missing forecasts and available forecasts with insufficient evidence. Projected sample positions and estimates can differ from real conditions between forecast locations.

- Green means favorable, amber means caution, red means potentially hazardous, and gray means unavailable or insufficient. The legend and markers pair color with text or symbols.
- Sections in the summary are runs of adjacent spans with the same classification. Coverage and proportions use distance, and estimated exposure uses the driving time of assessed caution and hazardous spans.
- The overall route result preserves any identified highest hazard, including an isolated point. Favorable requires complete classified distance coverage. Unknown spans have uncertain exposure.
- Advisories group consecutive samples that share a hazard, provided they are no more than an hour apart. Overlapping rain, wind, and visibility events retain separate advisories. Each group shows a representative hazard, time or range, location or mileage, and measurement when supplied. Selecting an advisory highlights spans touching those samples.
- Filters show markers, timeline rows, and advisories that match any selected category and emphasize nearby route sections. Other sections retain their severity color at lower emphasis. Show all restores the full presentation. Forecasts, original arrival times, and the route summary stay in memory and filters do not request providers again.

## Terrain and Phase 6

Live terrain assessment is pending. RainCheck's configured Google services do not include Elevation, and the project's Elevation API status and budget were not verified in Google Cloud. `RouteTerrainSample` defines sample ID, elevation in meters, and optional resolution for a future integration. Confirm API enablement, restrictions, and billing approval before collecting elevations. Elevation samples alone cannot establish road grade, surface conditions, mountain-pass status, or closures. [Google Elevation API setup and billing](https://developers.google.com/maps/documentation/elevation/usage-and-billing)

Phase 6 can use the existing series cache and UTC matcher with a different set of arrival times, call the same classifier, and compare exposure by section duration. This phase adds no departure-time scoring. RainCheck advisories are forecast-based planning estimates. Consult official forecasts and road reports for travel decisions.
