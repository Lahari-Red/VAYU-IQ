# VAYU-IQ — Air-Quality Intelligence Layer

**From monitoring to intervention — source-attributed, forecast-aware, enforcement-ready.**

India has invested heavily in air quality infrastructure, with 900+ CAAQMS stations already streaming readings across the country. What's missing isn't data, it's the layer that turns a reading into a decision. Today, when AQI spikes in a ward, there's no system that tells an official *why* it spiked, *how long* it will last, or *what specific action* would reduce it fastest. The result is a response cycle that stretches to days when it should take minutes.

VAYU-IQ is built to close exactly that gap. The entire platform is organized around one loop, and every module exists to serve some part of it:

> **signal → source attribution → recommended action → dispatch → measured response time**

Instead of stopping at visualization, VAYU-IQ tries to walk all the way through this loop: it identifies where a signal is coming from, forecasts where it's heading, recommends what to do about it, tracks who was dispatched, and measures how quickly the intervention actually happened. That last part, the measured response time, is what turns this from a dashboard into an accountability tool.

This repository is a working, single-file prototype that runs the full decision-support arc end-to-end across five major Indian cities: Delhi, Mumbai, Bengaluru, Chennai, and Kolkata.

---

## Run it

It's one self-contained file. Either:

```bash
# simplest — just open it
open index.html              # macOS  (or double-click the file)

# or serve locally (recommended, so the map tiles + fonts load cleanly)
python3 -m http.server 8080  # then visit http://localhost:8080
```

No build step or install is required to *run* `index.html`.

---

## What's in the prototype

The prototype is organized into eight modules, all accessible from the left navigation rail. Each one maps to a distinct stage of the signal-to-intervention loop.

| Module | What it does |
|---|---|
| **Command Center** | The entry point into the system. Gives a city-level overview, a live hotspot map, the top attributed hotspots currently active, and the signature **Signal → Intervention** pipeline visualization, complete with the *4–7 days vs minutes* response-time comparison that frames the entire problem. |
| **Source Attribution** | Breaks down pollution at the per-ward level into five categories: Traffic, Industry, Construction, Biomass, and Background. Rather than asserting a single cause, it shows the corroborating signals behind each attribution, including TROPOMI NO₂ satellite readings, FIRMS active fire data, traffic congestion levels, and industrial proximity, alongside a transparent confidence heuristic. An "Explain this attribution" feature generates a live, plain-language explanation of the reasoning. |
| **Forecast** | Produces a hyperlocal 24–72 hour AQI forecast with an explicit confidence band. Critically, this forecast is backtested against a persistence baseline using real, computed RMSE on held-out data, not a hardcoded accuracy claim, and includes a feature-importance breakdown so the drivers of the forecast are visible. |
| **Enforcement** | Ranks active hotspots using a combined score of `impact × population-exposed × actionability`. From here, the system can generate a full officer brief and dispatch an inspector, which is the exact moment the response-time clock starts and the loop closes. |
| **Health Risk** | Overlays vulnerability data, schools, hospitals, and exposed population density, on top of pollution hotspots, and generates citizen advisories live in regional languages (English, Hindi, or the relevant city's language) so warnings actually reach the people affected. |
| **Intervention Planner** | A what-if simulator. Officials can suppress a specific source (say, construction in a ward) and re-run the forecast to see the modeled AQI delta and the high-exposure person-hours avoided, all before committing real enforcement capacity to it. |
| **Multi-City** | Enables cross-city comparison and surfaces a "replicable wins" table, so an intervention that worked in one city can be identified and considered for adoption in another. |
| **Architecture** | Lays out the deployment-ready system diagram: ingestion → fusion → engines → LLM layer → channels, showing how this prototype would scale into a production system. |

---

## Honesty notes (please read before judging the numbers)

This is a prototype, and we were deliberate about not manufacturing false credibility around it. A few things worth being upfront about:

- **The underlying data is seeded demo data.** It's generated deterministically, meaning it's identical on every load, using city-specific baselines, a realistic diurnal cycle, autocorrelated drift, and added noise to mimic real sensor behavior. It is **not** live API data, and every screen in the prototype is clearly labelled `seeded demo data` so this is never ambiguous.

- **The forecast benchmark is real arithmetic, computed at runtime, not a hardcoded number.** The forecasting model itself combines a smoothed diurnal profile, an AR(1) residual term, and a small meteorology adjustment. It's fit on a 48-hour training window, with the final 24 hours held out for evaluation. RMSE is computed separately for the model and for a simple persistence baseline (essentially, "tomorrow will look like today," carrying the last observed value forward). The displayed improvement figure is `1 − model_RMSE / persistence_RMSE`, calculated live rather than asserted. This has been verified to outperform the persistence baseline across all 30 wards and all 3 forecast lead times. The margin looks large partly because flat persistence is a genuinely weak baseline against a strong diurnal cycle, that's expected, and we've labelled the baseline precisely so the comparison stays honest rather than inflated.

- **Attribution confidence is a transparent agreement heuristic, not a claim of statistical precision.** Confidence rises when multiple independent signals, like satellite NO₂ readings, fire counts, and industrial proximity, corroborate the same dominant source. The interface states this explicitly rather than implying a false level of certainty.

---

## What's live vs. stubbed

- **The LLM-powered features are genuinely live** in the Claude artifact preview. "Explain this attribution," multilingual citizen advisories, inspector briefs, and the Ask VAYU assistant all call Claude (`claude-sonnet-4-6`) through the in-app endpoint. Every one of these calls has a rich, deterministic fallback built in, so if the model is ever unreachable (for example, if this is deployed externally without an API key), the feature still returns a sensible, usable answer and nothing breaks.

  To make these LLM features live on an external deployment, route them through a small serverless proxy that injects your `ANTHROPIC_API_KEY` server-side. Never ship an API key directly in client-side code.

- **Production data connectors are intentionally stubbed at this stage.** The architecture is designed to plug into OpenAQ and CAAQMS for readings, Sentinel-5P TROPOMI for NO₂, NASA FIRMS for fire detection, Open-Meteo or ERA5 for meteorology, OSM or Bhuvan for land use, and WorldPop or Census data for population exposure. Swapping the current seeded engine for these live feeds is the defined path toward a production-ready v1.
