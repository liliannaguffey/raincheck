# Departure optimization

RainCheck compares estimated weather exposure along the same driving route at different departure times. The optimizer reuses the weather forecast and severity services, the original route sample coordinates, and the original cumulative driving durations. A weather exposure score helps compare candidates within this trip. It expresses weighted forecast exposure on a 0–100 scale and has no interpretation as an accident probability.

## Candidates and API

`POST /api/departures/recommendations` accepts the original departure timestamp in UTC, the ordered route samples, and flexibility settings. The settings allow 0, 1, 2, 3, or 6 hours, and earlier only, later only, or either. The default evaluates 13 departures from three hours earlier to three hours later at 30-minute intervals. The API also accepts a 60-minute interval. There are at most 25 candidates, including the original, and at most 256 samples in a request of up to 128 KB.

Past alternatives are excluded. The original remains the baseline. Every candidate arrival comes from its departure instant plus the sample's existing elapsed driving time. All calculations use UTC across midnight, time-zone boundaries, and daylight saving transitions. Local clock labels use the origin and destination zones when available, with UTC as the fallback. Equivalent local clock times during a fall-back transition retain distinct UTC instants.

The response includes a baseline and compact summaries for each evaluated candidate, with eligibility, score, coverage, hazard durations, and time-zone information. Up to three recommended candidates include weather points for previews. Route geometry is sent once through the route endpoint. The client uses the original road geometry and the candidate points to render colored sections and weather markers.

## Forecast matching and exposure scoring

The comparison prepares a shared forecast lookup for the full batch. It matches each candidate's recalculated arrival to an actual provider forecast timestamp, then uses the Phase 5 classifier and the same rule for severity between neighboring route samples. An unclassified endpoint makes the interval unknown. A fully assessed interval uses its more concerning endpoint classification.

Each interval contributes once to the total score. The default weights are favorable 0, caution 1, hazardous 3, and unknown 3. These are RainCheck heuristics. The higher hazardous weight makes long periods of hazardous weather more consequential. Unknown receives the maximum weight so missing forecasts cannot reduce a score.

`score = 100 × sum(intervalSeconds × severityWeight) / (totalDrivingSeconds × maximumWeight)`

Zero-duration routes are ineligible and receive no numerical score. Coverage is the number of classified driving seconds divided by total driving seconds. Hazard-level duration is computed separately for explanations. Hazards can overlap, so their individual durations can add up to more than the total elapsed time.

## Eligibility, ranking, and explanations

- Baseline and alternative require at least 90% classified driving time. If the baseline fails that requirement the comparison stops after evaluating it. Alternatives must retain coverage of every interval the baseline could classify. Inadequate coverage and lost baseline coverage are reported separately.
- A recommendation cannot increase total classified hazardous driving time. It must reduce hazardous exposure by at least 15 minutes, or improve the score by at least five points on the baseline-covered parts of the route. That common-coverage test prevents added coverage alone from counting as improvement. These defaults live in `server/src/departures/exposure.ts`.
- Rank by most hazardous time avoided, lowest full-route score, highest coverage, then smallest adjustment. For symmetric ties, prefer the earlier time. Candidates with the same profile of interval classifications and hazard categories and levels are grouped. The shortlist includes the best overall option and distinct best earlier or later options when worthwhile, up to three.
- Cards show the time adjustment and estimated arrival, coverage, severity durations, and changes in hazardous and caution exposure. The score delta is an absolute point change on comparable intervals. Hazard explanations use measured differences between the two evaluations and call out newly identified hazards.

### Worked example

A fully assessed four-hour trip originally has two favorable hours, one caution hour, and one hazardous hour. The score is `100 × (2×0 + 1×1 + 1×3) / (4×3) = 33.3`. A later departure has three favorable hours, 45 caution minutes, and 15 hazardous minutes. Its score is `100 × (3×0 + 0.75×1 + 0.25×3) / (4×3) = 12.5`. It saves 45 hazardous minutes, 15 caution minutes, and about 20.8 score points. It qualifies if the remaining conditions are comparable. Replacing an hour with missing forecasts would instead fail the coverage and comparability tests.

## Performance and limitations

For `C` candidates, `S` samples, and `F` forecast slots per location, matching costs `O(C × S × F)` with at most 40 slots in the current provider. The shared weather service sorts samples per candidate, adding up to `O(C × S log S)`, and ranking adds `O(C log C)`. Projection onto the driving polyline occurs in the client for the displayed route. Scoring uses the shared geometry-independent intervals in linear time per candidate.

Provider work is at most one forecast series lookup per distinct in-range coordinate per comparison. The application cache reuses valid series across route weather and separate comparisons. Cold lookups still follow the Phase 4 rate, queue, concurrency, and expiry limits. There are no Google route calls from the comparison endpoint. A synthetic warm-cache run with 25 candidates and 256 samples each completed in about 108 ms with zero additional provider calls. That is a local measurement with fixture data.

Trip Results automatically compares the default settings after original forecasts settle. Change the settings and select **Compare departures** to submit a new comparison. **Preview departure**, **Apply alternative**, and **Return to original** use the evaluated results and retain map geometry, matched timestamps, advisories, and filter behavior. Applying changes the active trip for the current Results session. Editing an applied trip carries the changed local departure into the planner. The recommendation set remains anchored to the original departure.

Actual traffic, stops, and forecasts can change. The three-hour OpenWeather slots often produce equivalent outcomes for nearby departures. The classifier does not account for terrain or road surface observations. Terrain data remains pending approved Elevation API configuration. A future version could incorporate traffic-aware arrival estimates and higher-resolution forecast adapters without changing the baseline and coverage rules.
