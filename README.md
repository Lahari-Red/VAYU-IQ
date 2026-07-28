# VAYU-IQ — Air-Quality Intelligence Layer

**From monitoring to intervention — source-attributed, forecast-aware, enforcement-ready.**

India has the sensors (900+ CAAQMS stations) but no intelligence layer that turns a reading into an *action*. VAYU-IQ closes that loop:

> **signal → source attribution → recommended action → dispatch → measured response time**

This repository is a working single-file prototype that runs the full decision-support arc for five cities (Delhi, Mumbai, Bengaluru, Chennai, Kolkata).

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

## What's in the prototype

Eight modules, all navigable from the left rail:

| Module | What it does |
|---|---|
| **Command Center** | City overview, live hotspot map, top attributed hotspots, and the signature **Signal → Intervention** pipeline with the *4–7 days vs minutes* response-time clock. |
| **Source Attribution** | Per-ward decomposition into Traffic / Industry / Construction / Biomass / Background, with the corroborating signals behind it (TROPOMI NO₂, FIRMS fires, congestion, industrial proximity) and a transparent confidence heuristic. "Explain this attribution" is generated live. |
| **Forecast** | Hyperlocal 24–72h forecast with a confidence band, **backtested against a persistence baseline** (real computed RMSE on held-out data) and a feature-importance breakdown. |
| **Enforcement** | Hotspots ranked by `impact × population-exposed × actionability`. Generates an officer brief and **dispatches an inspector — starting the response-time clock** (closes the loop). |
| **Health Risk** | Vulnerability overlay (schools/hospitals/exposed population) and citizen advisories generated **live in regional languages** (English / Hindi / the city's language). |
| **Intervention Planner** | What-if simulator: suppress a source and re-run the forecast to see the modeled AQI delta and high-exposure person-hours avoided *before* spending enforcement capacity. |
| **Multi-City** | Cross-city comparison and a "replicable wins" table so cities borrow proven interventions. |
| **Architecture** | The deployment-ready system diagram (ingestion → fusion → engines → LLM layer → channels). |

---

## Honesty notes (please read before judging the numbers)

This is a prototype. I was deliberate about *not* faking credibility:

- **Data is seeded demo data**, generated deterministically (same every load) with city-specific baselines, a realistic diurnal cycle, autocorrelated drift, and noise. It is **not** live API data. Every screen is labelled `seeded demo data`.
- **The forecast benchmark is real arithmetic, not a hardcoded number.** The model (smoothed diurnal profile + AR(1) residual + small meteorology adjustment) is fit on a 48h train window; the last 24h are held out; RMSE is computed for the model **and** for the persistence baseline ("tomorrow = today", last value carried forward). The displayed improvement is `1 − model_RMSE / persistence_RMSE`, computed at runtime. It is verified to beat persistence across all 30 wards × 3 lead times. The margin is large because flat persistence is a genuinely weak baseline against a strong diurnal cycle — that's expected, and the baseline is labelled precisely so the comparison is honest.
- **Attribution confidence is a transparent agreement heuristic**, not a precision claim. It rises when independent signals (satellite NO₂, fire counts, industrial proximity) corroborate the dominant source. The UI says so explicitly.

## What's live vs. stubbed

- **LLM features are genuinely live in the Claude artifact preview** — "Explain this attribution", multilingual advisories, inspector briefs, and Ask VAYU call Claude (`claude-sonnet-4-6`) through the in-app endpoint. Every call has a **rich deterministic fallback**, so if the model is unreachable (e.g. when deployed externally without an API key) the feature still returns a sensible answer and **nothing breaks**. To make the LLM features live on an external deploy, route them through a tiny serverless proxy that injects your `ANTHROPIC_API_KEY` (don't ship a key in the client).
- **Production data connectors are stubbed by design.** The architecture targets OpenAQ / CAAQMS (readings), Sentinel-5P TROPOMI (NO₂), NASA FIRMS (fires), Open-Meteo / ERA5 (meteorology), OSM / Bhuvan (land use), WorldPop / Census (exposure). Swapping the seeded engine for these feeds is the path to v1.







