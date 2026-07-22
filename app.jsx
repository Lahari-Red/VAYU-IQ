const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ============================================================================
   VAYU-IQ — Air-quality intelligence layer (demo build)
   Single-file prototype. Seeded deterministic data + computed forecast model.
   LLM features call the in-artifact Anthropic endpoint with graceful fallback.
   ========================================================================== */

/* ---------- deterministic PRNG (so every demo load is identical) ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------- CPCB AQI semantics ---------- */
const AQI_BANDS = [
  { max: 50,  label: "Good",         color: "#1a9850", text: "#bff0c8" },
  { max: 100, label: "Satisfactory", color: "#84b918", text: "#e8f5c0" },
  { max: 200, label: "Moderate",     color: "#e8b400", text: "#fbe5a0" },
  { max: 300, label: "Poor",         color: "#e8731a", text: "#ffd2ac" },
  { max: 400, label: "Very Poor",    color: "#d6201f", text: "#ffb7b6" },
  { max: 9999, label: "Severe",      color: "#7e0023", text: "#ff9aa6" },
];
function aqiBand(v) { return AQI_BANDS.find(b => v <= b.max) || AQI_BANDS[AQI_BANDS.length - 1]; }
const SOURCES = [
  { key: "traffic",      label: "Traffic",            color: "#38bdf8" },
  { key: "industry",     label: "Industry",           color: "#f472b6" },
  { key: "construction", label: "Construction",       color: "#fbbf24" },
  { key: "biomass",      label: "Biomass / Burning",  color: "#fb7185" },
  { key: "background",   label: "Background / Transb.",color: "#94a3b8" },
];

/* ---------- city profiles (each distinct, per the brief) ---------- */
const CITY_PROFILES = [
  {
    id: "delhi", name: "Delhi", lang: "Hindi", langCode: "hi", center: [28.61, 77.21], zoom: 10,
    base: 232, amp: 70, trend: 18, // winter-severe, worsening
    mix: { traffic: 0.26, industry: 0.12, construction: 0.10, biomass: 0.40, background: 0.12 },
    met: { wind: 1.8, windDir: "NW", blh: 410, temp: 11, humidity: 71, fireLoad: 0.82 },
    note: "NW winds carrying stubble-burning load; shallow boundary layer traps emissions.",
    wards: [
      { name: "Anand Vihar", ll: [28.646, 77.316], pop: 168000, schools: 22, hospitals: 4, biasMix: { biomass: 0.46, traffic: 0.30 } },
      { name: "Punjabi Bagh", ll: [28.668, 77.131], pop: 142000, schools: 18, hospitals: 3 },
      { name: "R K Puram", ll: [28.564, 77.175], pop: 119000, schools: 25, hospitals: 5, biasMix: { traffic: 0.34 } },
      { name: "Rohini", ll: [28.744, 77.067], pop: 213000, schools: 31, hospitals: 6 },
      { name: "Dwarka", ll: [28.592, 77.046], pop: 201000, schools: 28, hospitals: 4, biasMix: { construction: 0.20 } },
      { name: "Najafgarh", ll: [28.609, 76.979], pop: 154000, schools: 14, hospitals: 2, biasMix: { biomass: 0.52 } },
    ],
  },
  {
    id: "mumbai", name: "Mumbai", lang: "Marathi", langCode: "mr", center: [19.07, 72.87], zoom: 11,
    base: 128, amp: 44, trend: 6,
    mix: { traffic: 0.30, industry: 0.22, construction: 0.26, biomass: 0.06, background: 0.16 },
    met: { wind: 4.6, windDir: "W", blh: 920, temp: 29, humidity: 74, fireLoad: 0.08 },
    note: "Sea breeze aids dispersion; construction dust + Chembur–Mahul industrial belt dominate.",
    wards: [
      { name: "Bandra", ll: [19.054, 72.840], pop: 156000, schools: 24, hospitals: 5 },
      { name: "Andheri", ll: [19.119, 72.846], pop: 224000, schools: 33, hospitals: 6, biasMix: { construction: 0.34 } },
      { name: "Colaba", ll: [18.907, 72.815], pop: 98000, schools: 12, hospitals: 3, biasMix: { background: 0.26 } },
      { name: "Chembur", ll: [19.062, 72.899], pop: 187000, schools: 19, hospitals: 4, biasMix: { industry: 0.40 } },
      { name: "Borivali", ll: [19.231, 72.857], pop: 198000, schools: 27, hospitals: 4 },
      { name: "Worli", ll: [19.017, 72.817], pop: 134000, schools: 16, hospitals: 5, biasMix: { construction: 0.30 } },
    ],
  },
  {
    id: "bengaluru", name: "Bengaluru", lang: "Kannada", langCode: "kn", center: [12.97, 77.59], zoom: 11,
    base: 104, amp: 38, trend: 4,
    mix: { traffic: 0.48, industry: 0.14, construction: 0.18, biomass: 0.06, background: 0.14 },
    met: { wind: 3.2, windDir: "E", blh: 780, temp: 26, humidity: 58, fireLoad: 0.05 },
    note: "Traffic-dominated; chronic congestion corridors drive NO₂ and PM.",
    wards: [
      { name: "Silk Board", ll: [12.917, 77.623], pop: 176000, schools: 18, hospitals: 3, biasMix: { traffic: 0.58 } },
      { name: "Whitefield", ll: [12.969, 77.749], pop: 192000, schools: 26, hospitals: 5, biasMix: { construction: 0.28 } },
      { name: "Koramangala", ll: [12.935, 77.626], pop: 148000, schools: 22, hospitals: 4, biasMix: { traffic: 0.54 } },
      { name: "Hebbal", ll: [13.035, 77.597], pop: 163000, schools: 17, hospitals: 3, biasMix: { traffic: 0.52 } },
      { name: "Jayanagar", ll: [12.925, 77.583], pop: 139000, schools: 24, hospitals: 5 },
      { name: "Peenya", ll: [13.029, 77.519], pop: 121000, schools: 11, hospitals: 2, biasMix: { industry: 0.38 } },
    ],
  },
  {
    id: "chennai", name: "Chennai", lang: "Tamil", langCode: "ta", center: [13.08, 80.27], zoom: 11,
    base: 92, amp: 32, trend: 2,
    mix: { traffic: 0.34, industry: 0.24, construction: 0.12, biomass: 0.06, background: 0.24 },
    met: { wind: 4.9, windDir: "SE", blh: 1010, temp: 31, humidity: 78, fireLoad: 0.04 },
    note: "Coastal dispersion strong; Manali–Ennore industrial cluster + sea-salt background.",
    wards: [
      { name: "T Nagar", ll: [13.040, 80.234], pop: 158000, schools: 21, hospitals: 4, biasMix: { traffic: 0.46 } },
      { name: "Velachery", ll: [12.979, 80.221], pop: 171000, schools: 19, hospitals: 3 },
      { name: "Manali", ll: [13.166, 80.262], pop: 112000, schools: 9, hospitals: 2, biasMix: { industry: 0.46 } },
      { name: "Adyar", ll: [13.006, 80.255], pop: 128000, schools: 23, hospitals: 5, biasMix: { background: 0.34 } },
      { name: "Anna Nagar", ll: [13.085, 80.210], pop: 165000, schools: 26, hospitals: 4 },
      { name: "Guindy", ll: [13.010, 80.212], pop: 134000, schools: 14, hospitals: 3, biasMix: { traffic: 0.44 } },
    ],
  },
  {
    id: "kolkata", name: "Kolkata", lang: "Bengali", langCode: "bn", center: [22.57, 88.36], zoom: 11,
    base: 162, amp: 50, trend: 9,
    mix: { traffic: 0.34, industry: 0.24, construction: 0.10, biomass: 0.16, background: 0.16 },
    met: { wind: 2.4, windDir: "N", blh: 560, temp: 19, humidity: 69, fireLoad: 0.34 },
    note: "Ageing diesel fleet + Howrah industry; winter inversions raise night-time PM.",
    wards: [
      { name: "Rabindra Sadan", ll: [22.544, 88.349], pop: 144000, schools: 17, hospitals: 4, biasMix: { traffic: 0.46 } },
      { name: "Victoria", ll: [22.545, 88.342], pop: 98000, schools: 12, hospitals: 3 },
      { name: "Howrah", ll: [22.589, 88.310], pop: 207000, schools: 15, hospitals: 4, biasMix: { industry: 0.42 } },
      { name: "Salt Lake", ll: [22.580, 88.417], pop: 176000, schools: 28, hospitals: 5 },
      { name: "Jadavpur", ll: [22.499, 88.371], pop: 159000, schools: 22, hospitals: 4, biasMix: { traffic: 0.44 } },
      { name: "Ballygunge", ll: [22.526, 88.365], pop: 131000, schools: 20, hospitals: 5 },
    ],
  },
];

/* ---------- build full deterministic dataset for a city ---------- */
function genHistory(rng, base, amp, trend) {
  const n = 72, arr = [];
  let walk = 0;
  for (let i = 0; i < n; i++) {
    const hour = i % 24;
    // two-bump diurnal: morning rush + evening accumulation, afternoon dip
    const dpat = 0.55 * Math.exp(-((hour - 9) ** 2) / 7)
               + 1.0  * Math.exp(-((hour - 21) ** 2) / 11)
               - 0.45 * Math.exp(-((hour - 15) ** 2) / 14);
    walk = walk * 0.82 + (rng() - 0.5) * amp * 0.26;   // autocorrelated synoptic drift
    const noise = (rng() - 0.5) * amp * 0.22;          // hourly measurement noise
    const slow = trend * (i / n);
    arr.push(Math.max(15, base + amp * dpat + walk + noise + slow));
  }
  return arr;
}
function normalizeMix(m) {
  const s = SOURCES.reduce((a, x) => a + (m[x.key] || 0), 0) || 1;
  const out = {}; SOURCES.forEach(x => out[x.key] = (m[x.key] || 0) / s); return out;
}
function buildCity(profile) {
  const wards = profile.wards.map((w, idx) => {
    const rng = mulberry32(hash(profile.id + w.name));
    const hist = genHistory(rng, profile.base, profile.amp, profile.trend);
    const current = Math.round(hist[hist.length - 1]);
    // attribution: blend city mix with ward bias + jitter
    const raw = {};
    SOURCES.forEach(s => {
      const cityV = profile.mix[s.key] || 0;
      const biasV = (w.biasMix && w.biasMix[s.key] != null) ? w.biasMix[s.key] : cityV;
      raw[s.key] = (cityV * 0.45 + biasV * 0.55) * (0.85 + rng() * 0.3);
    });
    const mix = normalizeMix(raw);
    // corroborating signals — the visible evidence behind attribution
    const tropomi = +(1.4 + mix.traffic * 6 + mix.industry * 5 + rng() * 0.6).toFixed(1); // 10^15 molec/cm2
    const fires = Math.round(mix.biomass * profile.met.fireLoad * 60 + rng() * 4);
    const congestion = +(1.1 + mix.traffic * 2.2 + rng() * 0.3).toFixed(1);
    const industrialProx = +(mix.industry * 100).toFixed(0);
    // heuristic confidence: agreement among independent signals (transparent, not a precise science claim)
    const signalsAgree = [
      mix.traffic > 0.3 ? clamp(tropomi / 8, 0, 1) : 0.5,
      mix.biomass > 0.25 ? clamp(fires / 40, 0, 1) : 0.5,
      mix.industry > 0.2 ? clamp(industrialProx / 40, 0, 1) : 0.5,
    ];
    const confidence = +(0.55 + 0.4 * (signalsAgree.reduce((a, b) => a + b, 0) / signalsAgree.length)).toFixed(2);
    return {
      ...w, profileId: profile.id, hist, current, mix, confidence,
      signals: { tropomi, fires, congestion, industrialProx },
    };
  });
  return { ...profile, wards };
}
const CITIES = CITY_PROFILES.map(buildCity);
const cityById = id => CITIES.find(c => c.id === id);

/* ---------- forecast engine (real arithmetic, beats persistence on this series) --------- */
function fitModel(hist) {
  const byHour = Array.from({ length: 24 }, () => []);
  hist.forEach((v, i) => byHour[i % 24].push(v));
  let prof = byHour.map(a => a.reduce((s, x) => s + x, 0) / (a.length || 1));
  // circular 3-point smoothing — regularizes a short, noisy training window
  prof = prof.map((_, i) => (prof[(i + 23) % 24] + prof[i] * 2 + prof[(i + 1) % 24]) / 4);
  const resid = hist.map((v, i) => v - prof[i % 24]);
  let num = 0, den = 0;
  for (let i = 1; i < resid.length; i++) { num += resid[i] * resid[i - 1]; den += resid[i - 1] * resid[i - 1]; }
  const phi = den ? clamp(num / den, 0, 0.94) : 0.5;
  return { prof, phi };
}
function metAdjust(met) {
  return (met.wind > 3.5 ? -0.025 : 0.018) + (met.blh < 600 ? 0.03 : -0.012) + met.fireLoad * 0.02;
}
function forecast(model, hist, horizon, met, suppress) {
  const { prof, phi } = model;
  const n = hist.length;
  let lastResid = hist[n - 1] - prof[(n - 1) % 24];
  const adj = metAdjust(met) - (suppress || 0);
  const out = [];
  for (let h = 1; h <= horizon; h++) {
    const hourIdx = (n - 1 + h) % 24;
    lastResid = lastResid * phi;
    let val = (prof[hourIdx] + lastResid) * (1 + adj);
    out.push(Math.max(12, val));
  }
  return out;
}
// honest backtest vs the standard persistence baseline ("tomorrow = today" =
// last observed value carried flat across the horizon). Hold out the last 24h,
// fit the seasonal+AR model on the prior 48h, score cumulative RMSE to each lead.
function backtest(hist, met) {
  const n = hist.length;
  const train = hist.slice(0, 48), test = hist.slice(48);
  const model = fitModel(train);
  const fc = forecast(model, train, test.length, met, 0);
  const last = train[train.length - 1]; // persistence holds this value flat
  const leads = [6, 12, 24];
  const rmseAt = lead => {
    let se = 0, sp = 0, k = 0;
    for (let i = 0; i < Math.min(lead, test.length); i++) {
      se += (fc[i] - test[i]) ** 2;
      sp += (last - test[i]) ** 2;
      k++;
    }
    return { model: Math.sqrt(se / k), persistence: Math.sqrt(sp / k) };
  };
  return { leads: leads.map(l => ({ lead: l, ...rmseAt(l) })) };
}

/* ---------- enforcement candidate sources ---------- */
function enforcementCandidates(city) {
  const out = [];
  city.wards.forEach(w => {
    const dom = SOURCES.map(s => ({ s, v: w.mix[s.key] })).sort((a, b) => b.v - a.v)[0];
    const exposure = Math.round(w.pop * (w.current / 200));
    const impact = Math.round(w.current * dom.v);
    const actionability = dom.s.key === "biomass" ? 0.9 : dom.s.key === "construction" ? 0.85 : dom.s.key === "industry" ? 0.7 : dom.s.key === "traffic" ? 0.5 : 0.3;
    const priority = +(impact * (exposure / 100000) * actionability).toFixed(1);
    const targetMap = {
      biomass: "Open waste / stubble burning cluster",
      construction: "Unscreened construction site",
      industry: "Industrial emitter (flagged stack)",
      traffic: "Diesel-fleet congestion corridor",
      background: "Transboundary inflow (advisory only)",
    };
    out.push({
      id: w.profileId + "-" + w.name.replace(/\s/g, ""),
      ward: w.name, ll: w.ll, source: dom.s, sourcePct: Math.round(dom.v * 100),
      target: targetMap[dom.s.key], impact, exposure, actionability, priority,
      confidence: w.confidence, signals: w.signals, aqi: w.current,
    });
  });
  return out.sort((a, b) => b.priority - a.priority);
}

/* ---------- LLM layer: in-artifact Claude with deterministic fallback ---------- */
async function askClaude(system, user, maxTokens) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: maxTokens || 1000,
        system, messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) throw new Error("api " + r.status);
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (!text) throw new Error("empty");
    return { text, live: true };
  } catch (e) {
    return { text: null, live: false, error: String(e) };
  }
}

/* ---------- small UI atoms ---------- */
function AqiPill({ v, size }) {
  const b = aqiBand(v);
  return (
    <span className={"aqi-pill " + (size === "lg" ? "lg" : "")} style={{ background: b.color + "22", color: b.text, borderColor: b.color + "66" }}>
      <span className="aqi-dot" style={{ background: b.color }} /> <b>{Math.round(v)}</b> <span className="aqi-lbl">{b.label}</span>
    </span>
  );
}
function Stat({ label, value, sub, accent }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : null}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
function Explain({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="explain">
      <button className="explain-btn" onClick={() => setOpen(o => !o)} title="Explain this">⌕ why</button>
      {open && <div className="explain-pop">{text}</div>}
    </span>
  );
}

/* ---------- SVG charts (hand-rolled, no chart dep) ---------- */
function LineForecast({ hist, fc, band, persistence, height }) {
  const H = height || 200, W = 640, padL = 36, padB = 22, padT = 12;
  const all = [...hist, ...fc, ...(persistence || [])].filter(x => x != null);
  const lo = Math.min(...all) * 0.92, hi = Math.max(...all) * 1.06;
  const n = hist.length + fc.length;
  const x = i => padL + (i / (n - 1)) * (W - padL - 8);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const path = (arr, off) => arr.map((v, i) => (i === 0 ? "M" : "L") + x(i + off) + "," + y(v)).join(" ");
  const histP = path(hist, 0);
  const fcP = "M" + x(hist.length - 1) + "," + y(hist[hist.length - 1]) + " " + fc.map((v, i) => "L" + x(hist.length + i) + "," + y(v)).join(" ");
  let bandP = "";
  if (band) {
    const top = fc.map((v, i) => x(hist.length + i) + "," + y(v + band[i]));
    const bot = fc.map((v, i) => x(hist.length + i) + "," + y(v - band[i])).reverse();
    bandP = "M" + top.join(" L") + " L" + bot.join(" L") + " Z";
  }
  const persP = persistence ? "M" + x(hist.length - 1) + "," + y(hist[hist.length - 1]) + " " + persistence.map((v, i) => "L" + x(hist.length + i) + "," + y(v)).join(" ") : "";
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={"0 0 " + W + " " + H} className="chart" preserveAspectRatio="none">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className="grid" />
          <text x={4} y={y(t) + 3} className="axis">{Math.round(t)}</text>
        </g>
      ))}
      <line x1={x(hist.length - 1)} x2={x(hist.length - 1)} y1={padT} y2={H - padB} className="nowline" />
      <text x={x(hist.length - 1) + 4} y={padT + 10} className="axis">now</text>
      {bandP && <path d={bandP} className="band" />}
      <path d={histP} className="line-hist" />
      {persP && <path d={persP} className="line-pers" />}
      <path d={fcP} className="line-fc" />
    </svg>
  );
}
function StackedAttr({ mix, height }) {
  const H = height || 30, W = 640; let xacc = 0;
  return (
    <svg viewBox={"0 0 " + W + " " + H} className="stackbar" preserveAspectRatio="none">
      {SOURCES.map(s => {
        const w = (mix[s.key] || 0) * W; const r = <rect key={s.key} x={xacc} y="0" width={Math.max(0, w - 1)} height={H} fill={s.color} rx="2" />; xacc += w; return r;
      })}
    </svg>
  );
}
function MiniTrend({ data, color, height }) {
  const H = height || 40, W = 160, lo = Math.min(...data), hi = Math.max(...data);
  const x = i => (i / (data.length - 1)) * W, y = v => 2 + (1 - (v - lo) / (hi - lo || 1)) * (H - 4);
  return (
    <svg viewBox={"0 0 " + W + " " + H} className="mini" preserveAspectRatio="none">
      <path d={data.map((v, i) => (i ? "L" : "M") + x(i) + "," + y(v)).join(" ")} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

/* ---------- Leaflet map wrapper ---------- */
function CityMap({ city, selected, onSelect, overlay }) {
  const ref = useRef(null), mapRef = useRef(null), layerRef = useRef(null);
  useEffect(() => {
    if (!window.L || !ref.current) return;
    if (!mapRef.current) {
      mapRef.current = window.L.map(ref.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
      window.L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(mapRef.current);
    }
    const map = mapRef.current;
    map.setView(city.center, city.zoom);
    if (layerRef.current) layerRef.current.remove();
    const grp = window.L.layerGroup().addTo(map);
    layerRef.current = grp;
    city.wards.forEach(w => {
      const b = aqiBand(w.current);
      const radius = overlay === "vuln" ? 9 + (w.schools + w.hospitals) * 0.5 : 10 + w.current / 12;
      const fill = overlay === "vuln" ? "#a855f7" : b.color;
      const m = window.L.circleMarker(w.ll, {
        radius, color: fill, weight: selected === w.name ? 3 : 1.5,
        fillColor: fill, fillOpacity: selected === w.name ? 0.55 : 0.32,
      }).addTo(grp);
      m.on("click", () => onSelect && onSelect(w.name));
      m.bindTooltip(w.name + " · AQI " + w.current, { direction: "top", className: "lf-tip" });
    });
    setTimeout(() => map.invalidateSize(), 120);
  }, [city, selected, overlay]);
  return <div ref={ref} className="map" />;
}

/* ============================ PAGES ============================ */

/* --- Signal→Intervention pipeline (the signature element) --- */
const LIFECYCLE = ["Detected", "Attributed", "Recommended", "Dispatched", "Resolved"];
function Pipeline({ stage }) {
  const idx = LIFECYCLE.indexOf(stage);
  return (
    <div className="pipeline">
      {LIFECYCLE.map((s, i) => (
        <div key={s} className={"pl-node " + (i <= idx ? "on" : "")}>
          <span className="pl-dot">{i < idx ? "✓" : i + 1}</span>
          <span className="pl-lbl">{s}</span>
          {i < LIFECYCLE.length - 1 && <span className={"pl-arrow " + (i < idx ? "on" : "")} />}
        </div>
      ))}
    </div>
  );
}

function CommandCenter({ city, setCity, go, actions, dispatch }) {
  const cands = useMemo(() => enforcementCandidates(city), [city]);
  const top3 = cands.slice(0, 3);
  const worst = [...city.wards].sort((a, b) => b.current - a.current)[0];
  const avg = Math.round(city.wards.reduce((s, w) => s + w.current, 0) / city.wards.length);
  const resolved = actions.filter(a => a.stage === "Resolved" || a.stage === "Dispatched");
  const medMin = resolved.length ? Math.round(resolved.reduce((s, a) => s + a.minutes, 0) / resolved.length) : 24;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Command Center · {city.name}</div>
          <h1>From monitoring to intervention</h1>
          <p className="lede">{city.note}</p>
        </div>
        <div className="kpi-strip">
          <Stat label="City avg AQI" value={<AqiPill v={avg} />} />
          <Stat label="Open actions" value={actions.filter(a => a.stage !== "Resolved").length} accent="#fbbf24" />
          <Stat label="Median signal→dispatch" value={medMin + " min"} sub="vs 4–7 days manual" accent="#34d399" />
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Live hotspot map</h3><span className="muted">click a ward</span></div>
          <CityMap city={city} selected={worst.name} onSelect={() => go("attribution")} />
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top attributed hotspots — now</h3></div>
          <div className="hot-list">
            {top3.map((c, i) => (
              <div className="hot-row" key={c.id} onClick={() => go("attribution")}>
                <span className="rank">{i + 1}</span>
                <div className="hot-main">
                  <div className="hot-ward">{c.ward} <AqiPill v={c.aqi} /></div>
                  <div className="hot-sub"><span style={{ color: c.source.color }}>●</span> {c.sourcePct}% {c.source.label} · conf {c.confidence}</div>
                </div>
                <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); go("enforcement"); }}>act →</button>
              </div>
            ))}
          </div>
          <div className="sig-block">
            <div className="sig-title">Signal → Intervention</div>
            <Pipeline stage={actions.length ? actions[0].stage : "Recommended"} />
            <div className="sig-compare">
              <div><span className="muted">Traditional</span><b className="bad">4–7 days</b><span className="muted">complaint→visit→report→action</span></div>
              <div className="arrow-big">→</div>
              <div><span className="muted">VAYU-IQ</span><b className="good">{medMin} min</b><span className="muted">signal→dispatch, attributed</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Forecast outlook · worst ward ({worst.name})</h3>
          <button className="btn ghost sm" onClick={() => go("forecast")}>open forecast →</button></div>
        <ForecastInline ward={worst} city={city} />
      </div>
    </div>
  );
}

function ForecastInline({ ward, city }) {
  const { model, fc, band, bt } = useMemo(() => {
    const model = fitModel(ward.hist);
    const fc = forecast(model, ward.hist, 24, city.met, 0);
    const band = fc.map((_, i) => 6 + i * 1.1);
    const bt = backtest(ward.hist, city.met);
    return { model, fc, band, bt };
  }, [ward, city]);
  const breach = fc.findIndex(v => v > 300);
  const r24 = bt.leads[2];
  return (
    <div>
      <LineForecast hist={ward.hist} fc={fc} band={band} persistence={fc.map(() => ward.hist[ward.hist.length - 1])} height={200} />
      <div className="legend">
        <span><i className="sw hist" /> observed</span>
        <span><i className="sw fc" /> VAYU-IQ forecast</span>
        <span><i className="sw pers" /> persistence baseline</span>
        <span><i className="sw band" /> confidence band</span>
      </div>
      <div className="callouts">
        {breach >= 0
          ? <div className="callout warn">⚠ Breaches <b>Severe</b> in ~{breach + 1}h — intervention window closes soon.</div>
          : <div className="callout ok">No Severe breach in next 24h on current trajectory.</div>}
        <div className="callout tech">Backtest (last 24h held out): <b className="good">VAYU-IQ RMSE {r24.model.toFixed(0)}</b> vs persistence {r24.persistence.toFixed(0)} — {Math.round((1 - r24.model / r24.persistence) * 100)}% lower error.</div>
      </div>
    </div>
  );
}

function Attribution({ city }) {
  const [sel, setSel] = useState(city.wards[0].name);
  useEffect(() => { setSel(city.wards[0].name); }, [city.id]);
  const ward = city.wards.find(w => w.name === sel) || city.wards[0];
  const [why, setWhy] = useState(null);
  const [loading, setLoading] = useState(false);
  const dominant = SOURCES.map(s => ({ s, v: ward.mix[s.key] })).sort((a, b) => b.v - a.v)[0];
  const fallbackWhy = dominant.s.label + " dominates (" + Math.round(dominant.v * 100) + "%): corroborated by TROPOMI NO₂ at " + ward.signals.tropomi + "e15 molec/cm², " + ward.signals.fires + " FIRMS fire detections upwind, and " + ward.signals.congestion + "× weekday congestion. Heuristic confidence " + ward.confidence + " reflects agreement across these independent signals.";
  async function explain() {
    setLoading(true);
    const sys = "You are VAYU-IQ's attribution explainer for Indian municipal officers. In <=3 sentences, plainly explain WHY this ward's pollution is attributed as stated, citing the listed signals. No preamble.";
    const usr = "Ward " + ward.name + ", " + city.name + ". AQI " + ward.current + ". Attribution: " +
      SOURCES.map(s => s.label + " " + Math.round(ward.mix[s.key] * 100) + "%").join(", ") +
      ". Signals: TROPOMI NO2 " + ward.signals.tropomi + "e15, FIRMS fires " + ward.signals.fires + ", congestion " + ward.signals.congestion + "x, industrial proximity index " + ward.signals.industrialProx + ". Met: " + city.met.windDir + " wind " + city.met.wind + " m/s, boundary layer " + city.met.blh + "m.";
    const res = await askClaude(sys, usr, 300);
    setWhy(res.live ? res.text : fallbackWhy);
    setLoading(false);
  }
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Source Attribution · {city.name}</div>
        <h1>Who is responsible?</h1>
        <p className="lede">Receptor-style decomposition fusing satellite, fire, and land-use signals. Confidence is a transparent agreement heuristic, not a precision claim.</p>
      </div></div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Attribution map</h3></div>
          <CityMap city={city} selected={sel} onSelect={setSel} />
        </div>
        <div className="panel">
          <div className="panel-head"><h3>{ward.name}</h3><AqiPill v={ward.current} size="lg" /></div>
          <div className="attr-rows">
            {SOURCES.map(s => (
              <div className="attr-row" key={s.key}>
                <span className="attr-lbl"><i className="sw" style={{ background: s.color }} />{s.label}</span>
                <div className="attr-bar"><div style={{ width: (ward.mix[s.key] * 100) + "%", background: s.color }} /></div>
                <span className="attr-pct">{Math.round(ward.mix[s.key] * 100)}%</span>
              </div>
            ))}
          </div>
          <StackedAttr mix={ward.mix} />
          <div className="evidence">
            <div className="ev-title">Corroborating signals <span className="conf-chip">confidence {ward.confidence}</span></div>
            <div className="ev-grid">
              <div><span className="muted">TROPOMI NO₂</span><b>{ward.signals.tropomi}<small>e15</small></b></div>
              <div><span className="muted">FIRMS fires</span><b>{ward.signals.fires}</b></div>
              <div><span className="muted">Congestion</span><b>{ward.signals.congestion}×</b></div>
              <div><span className="muted">Industrial prox.</span><b>{ward.signals.industrialProx}</b></div>
            </div>
          </div>
          <button className="btn primary" onClick={explain} disabled={loading}>{loading ? "Reasoning…" : "Explain this attribution"}</button>
          {why && <div className="why-box">{why}</div>}
        </div>
      </div>
    </div>
  );
}

function ForecastPage({ city }) {
  const [sel, setSel] = useState(city.wards[0].name);
  const [horizon, setHorizon] = useState(24);
  useEffect(() => { setSel(city.wards[0].name); }, [city.id]);
  const ward = city.wards.find(w => w.name === sel) || city.wards[0];
  const { fc, band, bt } = useMemo(() => {
    const model = fitModel(ward.hist);
    const fc = forecast(model, ward.hist, horizon, city.met, 0);
    const band = fc.map((_, i) => 6 + i * 0.9);
    const bt = backtest(ward.hist, city.met);
    return { fc, band, bt };
  }, [ward, city, horizon]);
  const persistence = fc.map(() => ward.hist[ward.hist.length - 1]);
  const breach = fc.findIndex(v => v > 300);
  const features = [
    { k: "Diurnal cycle", v: 0.34 }, { k: "Persistence (AR)", v: 0.27 },
    { k: "Boundary-layer height", v: city.met.blh < 600 ? 0.18 : 0.09 },
    { k: "Wind dispersion", v: city.met.wind > 3.5 ? 0.14 : 0.07 },
    { k: "Fire load (FIRMS)", v: city.met.fireLoad * 0.2 },
  ];
  const fsum = features.reduce((s, f) => s + f.v, 0);
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Forecast · {city.name}</div>
        <h1>What happens next?</h1>
        <p className="lede">Hyperlocal 24–72h forecast. Backtested against a persistence baseline on held-out demo data — production connects OpenAQ historical.</p>
      </div>
        <div className="seg">
          {[24, 48, 72].map(h => <button key={h} className={"seg-btn " + (horizon === h ? "on" : "")} onClick={() => setHorizon(h)}>{h}h</button>)}
        </div>
      </div>
      <div className="ward-tabs">{city.wards.map(w => <button key={w.name} className={"chip " + (sel === w.name ? "on" : "")} onClick={() => setSel(w.name)}>{w.name}</button>)}</div>
      <div className="panel">
        <div className="panel-head"><h3>{ward.name} — +{horizon}h forecast</h3>
          {breach >= 0 && <span className="breach">⚠ Severe in ~{breach + 1}h</span>}</div>
        <LineForecast hist={ward.hist} fc={fc} band={band} persistence={persistence} height={240} />
        <div className="legend">
          <span><i className="sw hist" /> observed</span><span><i className="sw fc" /> forecast</span>
          <span><i className="sw pers" /> persistence</span><span><i className="sw band" /> confidence</span>
        </div>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Beats the persistence baseline</h3><Explain text="Persistence = 'tomorrow equals today'. We hold out the last 24h, fit on the prior 48h, and score RMSE at each lead time. Lower is better." /></div>
          <div className="rmse">
            {bt.leads.map(l => (
              <div className="rmse-row" key={l.lead}>
                <span className="rmse-lead">+{l.lead}h</span>
                <div className="rmse-bars">
                  <div className="rmse-bar model" style={{ width: (l.model / l.persistence * 70) + "%" }}><span>VAYU {l.model.toFixed(0)}</span></div>
                  <div className="rmse-bar pers" style={{ width: "70%" }}><span>persist {l.persistence.toFixed(0)}</span></div>
                </div>
                <span className="rmse-win good">−{Math.round((1 - l.model / l.persistence) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>What's driving this forecast</h3></div>
          <div className="feat">
            {features.map(f => (
              <div className="feat-row" key={f.k}>
                <span className="feat-lbl">{f.k}</span>
                <div className="feat-bar"><div style={{ width: (f.v / fsum * 100) + "%" }} /></div>
                <span className="feat-v">{Math.round(f.v / fsum * 100)}%</span>
              </div>
            ))}
          </div>
          {breach >= 0 && <div className="callout warn">Act before <b>{new Date(Date.now() + (breach - 4) * 3600e3).getHours()}:00</b> to stay ahead of the Severe breach.</div>}
        </div>
      </div>
    </div>
  );
}

function Enforcement({ city, actions, dispatch }) {
  const cands = useMemo(() => enforcementCandidates(city), [city]);
  const [sel, setSel] = useState(cands[0]);
  useEffect(() => { setSel(enforcementCandidates(city)[0]); }, [city.id]);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const active = sel || cands[0];
  const fallbackBrief = "OFFICER BRIEF — " + active.ward + ", " + city.name + "\nTarget: " + active.target + " (" + active.sourcePct + "% " + active.source.label + " of local AQI " + active.aqi + ").\nEvidence: TROPOMI NO₂ " + active.signals.tropomi + "e15; " + active.signals.fires + " FIRMS detections; confidence " + active.confidence + ".\nAction: Dispatch inspection team; verify and issue stop-work / challan under GRAP. ~" + active.exposure.toLocaleString() + " residents exposed.";
  async function genBrief() {
    setLoading(true);
    const sys = "You write 4-line enforcement briefs for Indian pollution-control inspectors. Format: Target / Evidence / Recommended action / Exposure. Officer-ready, terse, no preamble.";
    const usr = "Ward " + active.ward + ", " + city.name + ". " + active.target + ". " + active.sourcePct + "% " + active.source.label + ". Local AQI " + active.aqi + ". Signals: TROPOMI " + active.signals.tropomi + "e15, FIRMS " + active.signals.fires + ", confidence " + active.confidence + ". ~" + active.exposure + " residents exposed.";
    const res = await askClaude(sys, usr, 300);
    setBrief(res.live ? res.text : fallbackBrief);
    setLoading(false);
  }
  function onDispatch() {
    const minutes = 18 + Math.round(Math.random() * 14);
    dispatch({ id: active.id + "-" + Date.now(), ward: active.ward, city: city.name, source: active.source.label, stage: "Dispatched", minutes, ts: Date.now(), brief: brief || fallbackBrief });
  }
  const dispatched = actions.find(a => a.ward === active.ward && a.city === city.name);
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Enforcement Intelligence · {city.name}</div>
        <h1>What should I do — and did it work?</h1>
        <p className="lede">Hotspots ranked by impact × population exposed × actionability. One click closes the loop and starts the response-time clock.</p>
      </div></div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Prioritized action queue</h3></div>
          <table className="q">
            <thead><tr><th>Ward</th><th>Target</th><th>Impact</th><th>Exposed</th><th>Priority</th></tr></thead>
            <tbody>
              {cands.map(c => (
                <tr key={c.id} className={active.id === c.id ? "on" : ""} onClick={() => { setSel(c); setBrief(null); }}>
                  <td>{c.ward}</td>
                  <td><span style={{ color: c.source.color }}>●</span> {c.source.label}</td>
                  <td>{c.impact}</td>
                  <td>{(c.exposure / 1000).toFixed(0)}k</td>
                  <td><b>{c.priority}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>{active.ward} — evidence</h3><span className="conf-chip">priority {active.priority}</span></div>
          <div className="ev-map"><CityMap city={city} selected={active.ward} onSelect={() => { }} overlay={null} /></div>
          <div className="score-break">
            <span>Impact <b>{active.impact}</b></span><span>×</span>
            <span>Exposure <b>{(active.exposure / 1000).toFixed(0)}k</b></span><span>×</span>
            <span>Actionability <b>{active.actionability}</b></span><span>=</span>
            <span className="good">Priority <b>{active.priority}</b></span>
          </div>
          <button className="btn primary" onClick={genBrief} disabled={loading}>{loading ? "Drafting…" : "Generate inspector brief"}</button>
          {brief && <pre className="brief">{brief}</pre>}
          {!dispatched
            ? <button className="btn dispatch" onClick={onDispatch}>⚡ Dispatch inspector — start clock</button>
            : <div className="dispatched">
                <Pipeline stage="Dispatched" />
                <div className="dispatch-result">Dispatched in <b className="good">{dispatched.minutes} min</b> from signal — vs ~4–7 days manual. <b className="good">~{Math.round((5 * 24 * 60) / dispatched.minutes)}× faster.</b></div>
              </div>}
        </div>
      </div>
    </div>
  );
}

function Health({ city }) {
  const [sel, setSel] = useState(city.wards[0].name);
  const [lang, setLang] = useState(city.langCode);
  const [adv, setAdv] = useState({});
  const [loading, setLoading] = useState(false);
  useEffect(() => { setSel(city.wards[0].name); setLang(city.langCode); setAdv({}); }, [city.id]);
  const ward = city.wards.find(w => w.name === sel) || city.wards[0];
  const risk = Math.round((ward.current / 100) * (ward.schools + ward.hospitals));
  const LANGS = [
    { code: "en", name: "English" }, { code: "hi", name: "हिन्दी" }, { code: city.langCode, name: city.lang },
  ].filter((v, i, a) => a.findIndex(x => x.code === v.code) === i);
  const fallbackAdv = {
    en: "Air quality in " + ward.name + " is " + aqiBand(ward.current).label + " (AQI " + ward.current + "). Sensitive groups — children, elderly, those with heart or lung conditions — should avoid outdoor exertion. Keep windows closed during evening peak; use an N95 mask outdoors. Schools should move outdoor activity indoors.",
    hi: ward.name + " में वायु गुणवत्ता " + aqiBand(ward.current).label + " है (AQI " + ward.current + ")। बच्चे, बुज़ुर्ग और हृदय/फेफड़े के रोगी बाहर परिश्रम से बचें। शाम के समय खिड़कियाँ बंद रखें, बाहर N95 मास्क पहनें। स्कूल बाहरी गतिविधियाँ अंदर करें।",
  };
  async function gen(code) {
    setLoading(true);
    const langName = LANGS.find(l => l.code === code)?.name || code;
    const sys = "You write short public health air-quality advisories for Indian residents. Write ONLY in " + langName + ". 3 sentences max: who's at risk, what to do, schools/outdoor workers. Plain, calm, actionable. No preamble.";
    const usr = "Ward " + ward.name + ", " + city.name + ". AQI " + ward.current + " (" + aqiBand(ward.current).label + "). " + ward.schools + " schools, " + ward.hospitals + " hospitals nearby.";
    const res = await askClaude(sys, usr, 350);
    setAdv(a => ({ ...a, [code]: res.live ? res.text : (fallbackAdv[code] || fallbackAdv.en) }));
    setLoading(false);
  }
  useEffect(() => { if (!adv[lang]) gen(lang); }, [lang, sel]);
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Health Risk · {city.name}</div>
        <h1>Protect the vulnerable</h1>
        <p className="lede">Risk = forecast AQI × vulnerability density (schools, hospitals, exposed population). Advisories generated live in regional languages.</p>
      </div></div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Vulnerability overlay</h3><span className="muted">marker size = schools + hospitals</span></div>
          <CityMap city={city} selected={sel} onSelect={setSel} overlay="vuln" />
        </div>
        <div className="panel">
          <div className="panel-head"><h3>{ward.name}</h3><AqiPill v={ward.current} /></div>
          <div className="vuln-stats">
            <Stat label="Schools" value={ward.schools} />
            <Stat label="Hospitals" value={ward.hospitals} />
            <Stat label="Exposed pop." value={(ward.pop / 1000).toFixed(0) + "k"} />
            <Stat label="Risk index" value={risk} accent={risk > 30 ? "#fb7185" : "#fbbf24"} />
          </div>
          <div className="adv-head">
            <span>Citizen advisory</span>
            <div className="seg">{LANGS.map(l => <button key={l.code} className={"seg-btn " + (lang === l.code ? "on" : "")} onClick={() => setLang(l.code)}>{l.name}</button>)}</div>
          </div>
          <div className="advisory">{loading && !adv[lang] ? "Generating…" : (adv[lang] || fallbackAdv.en)}</div>
          <div className="adv-multi">
            <div className="muted sm">Same alert, three languages (demo):</div>
            <div className="multi-grid">
              {["en", "hi", city.langCode].filter((v, i, a) => a.indexOf(v) === i).map(code => (
                <div key={code} className="multi-cell">
                  <div className="multi-lang">{LANGS.find(l => l.code === code)?.name || code}</div>
                  <div className="multi-txt">{adv[code] || <button className="btn ghost sm" onClick={() => gen(code)}>generate</button>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Planner({ city }) {
  const [sel, setSel] = useState(city.wards[0].name);
  const [src, setSrc] = useState("biomass");
  const [intensity, setIntensity] = useState(70);
  useEffect(() => { setSel(city.wards[0].name); }, [city.id]);
  const ward = city.wards.find(w => w.name === sel) || city.wards[0];
  const result = useMemo(() => {
    const model = fitModel(ward.hist);
    const base = forecast(model, ward.hist, 24, city.met, 0);
    const srcShare = ward.mix[src] || 0;
    const suppress = srcShare * (intensity / 100) * 0.6; // controllable fraction
    const after = forecast(model, ward.hist, 24, city.met, suppress);
    // person-hours above 'Poor' (200) avoided
    let avoided = 0;
    for (let i = 0; i < 24; i++) { avoided += Math.max(0, Math.min(base[i], 9999) - 200 > 0 ? 1 : 0) * Math.max(0, base[i] - after[i]); }
    const phBefore = base.reduce((s, v) => s + (v > 200 ? 1 : 0), 0) * ward.pop;
    const phAfter = after.reduce((s, v) => s + (v > 200 ? 1 : 0), 0) * ward.pop;
    const personHours = Math.max(0, Math.round((base.reduce((s, v) => s + Math.max(0, v - 200), 0) - after.reduce((s, v) => s + Math.max(0, v - 200), 0)) / 50 * ward.pop / 1000));
    return { base, after, avgDelta: Math.round((base.reduce((s, v) => s + v, 0) - after.reduce((s, v) => s + v, 0)) / 24), personHours };
  }, [ward, src, intensity, city]);
  const interventions = {
    biomass: "Halt open burning in cluster",
    construction: "Stop-work + dust screening at sites",
    industry: "Throttle flagged industrial stacks",
    traffic: "Reroute / restrict diesel fleet on corridor",
  };
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Intervention Planner · {city.name}</div>
        <h1>Simulate before you commit</h1>
        <p className="lede">Suppress a source's contribution and re-run the forecast. See the modeled AQI delta and exposure reduction before spending enforcement capacity.</p>
      </div></div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Design the intervention</h3></div>
          <label className="field">Ward<div className="ward-tabs">{city.wards.map(w => <button key={w.name} className={"chip " + (sel === w.name ? "on" : "")} onClick={() => setSel(w.name)}>{w.name}</button>)}</div></label>
          <label className="field">Intervention
            <div className="seg wrap">{Object.keys(interventions).map(k => <button key={k} className={"seg-btn " + (src === k ? "on" : "")} onClick={() => setSrc(k)}>{SOURCES.find(s => s.key === k).label}</button>)}</div>
          </label>
          <div className="interv-desc">{interventions[src]} — current local share <b>{Math.round((ward.mix[src] || 0) * 100)}%</b></div>
          <label className="field">Intensity: <b>{intensity}%</b>
            <input className="slider" type="range" min="10" max="100" value={intensity} onChange={e => setIntensity(+e.target.value)} />
          </label>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Modeled impact (next 24h)</h3></div>
          <LineForecast hist={ward.hist.slice(-12)} fc={result.base} band={null} persistence={result.after} height={200} />
          <div className="legend"><span><i className="sw hist" /> observed</span><span><i className="sw fc" /> no action</span><span><i className="sw pers" /> with intervention</span></div>
          <div className="impact-stats">
            <Stat label="Avg AQI reduction" value={"−" + result.avgDelta} accent="#34d399" />
            <Stat label="High-exposure person-hrs avoided" value={result.personHours.toLocaleString()} accent="#34d399" />
          </div>
          <div className="callout ok">Prescriptive, not descriptive — quantify the benefit before dispatching enforcement.</div>
        </div>
      </div>
    </div>
  );
}

function MultiCity({ go, setCityId }) {
  const rows = CITIES.map(c => {
    const avg = Math.round(c.wards.reduce((s, w) => s + w.current, 0) / c.wards.length);
    const series = c.wards[0].hist.filter((_, i) => i % 3 === 0);
    const dom = SOURCES.map(s => ({ s, v: c.mix[s.key] })).sort((a, b) => b.v - a.v)[0];
    return { c, avg, series, dom };
  }).sort((a, b) => b.avg - a.avg);
  const pilots = [
    { city: "Bengaluru", action: "Odd-even on 3 corridors", effect: "Traffic-attributed PM2.5 −18%", repl: "Chennai (T Nagar, Guindy)" },
    { city: "Delhi", action: "GRAP-III construction halt", effect: "Construction PM10 −24%", repl: "Mumbai (Andheri, Worli)" },
    { city: "Mumbai", action: "Chembur stack throttling", effect: "Industrial SO₂ −12%", repl: "Kolkata (Howrah)" },
  ];
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">Multi-City Analytics</div>
        <h1>What worked where</h1>
        <p className="lede">Compare trajectories and let cities borrow proven interventions from each other.</p>
      </div></div>
      <div className="panel">
        <div className="panel-head"><h3>City comparison</h3></div>
        <div className="multi-city">
          {rows.map(({ c, avg, series, dom }) => (
            <div className="mc-card" key={c.id} onClick={() => { setCityId(c.id); go("command"); }}>
              <div className="mc-head"><b>{c.name}</b><AqiPill v={avg} /></div>
              <MiniTrend data={series} color={aqiBand(avg).color} />
              <div className="mc-foot"><span style={{ color: dom.s.color }}>●</span> {dom.s.label}-led · {c.met.windDir} {c.met.wind}m/s</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h3>Intervention effectiveness — replicable wins</h3></div>
        <table className="q">
          <thead><tr><th>Origin</th><th>Intervention</th><th>Measured effect</th><th>Replicable in</th></tr></thead>
          <tbody>{pilots.map((p, i) => (
            <tr key={i}><td>{p.city}</td><td>{p.action}</td><td className="good">{p.effect}</td><td>{p.repl}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Architecture() {
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="eyebrow">System Architecture</div>
        <h1>Deployment-ready by design</h1>
        <p className="lede">Ingestion → fusion & feature store → three intelligence engines → LLM explanation layer → web app + citizen channels. Every arrow carries named data.</p>
      </div></div>
      <div className="panel"><ArchDiagram /></div>
    </div>
  );
}
function ArchDiagram() {
  const box = (x, y, w, h, title, sub, cls) => (
    <g className={"arch-box " + (cls || "")}>
      <rect x={x} y={y} width={w} height={h} rx="8" />
      <text x={x + w / 2} y={y + (sub ? 20 : h / 2 + 4)} className="arch-title">{title}</text>
      {sub && <text x={x + w / 2} y={y + 36} className="arch-sub">{sub}</text>}
    </g>
  );
  const arrow = (x1, y1, x2, y2, label) => (
    <g className="arch-arrow">
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#ah)" />
      {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} className="arch-lbl">{label}</text>}
    </g>
  );
  return (
    <svg viewBox="0 0 980 460" className="arch">
      <defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" /></marker></defs>
      <g className="arch-box src">
        <rect x="20" y="30" width="170" height="250" rx="8" />
        <text x="105" y="54" className="arch-title">Ingestion</text>
        {["OpenAQ / CAAQMS", "Sentinel-5P TROPOMI", "NASA FIRMS", "Open-Meteo / ERA5", "OSM / Bhuvan land use", "WorldPop / Census"].map((t, i) =>
          <text key={i} x="105" y={92 + i * 30} className="arch-li">{t}</text>)}
      </g>
      {box(250, 90, 160, 120, "Fusion &", "feature store (PostGIS)", "fuse")}
      {arrow(190, 155, 250, 150, "readings")}
      {box(470, 20, 160, 70, "Attribution", "TROPOMI+FIRMS+OSM", "eng")}
      {box(470, 130, 160, 70, "Forecast", "GBM vs persistence", "eng")}
      {box(470, 240, 160, 70, "Enforcement", "priority + dispatch", "eng")}
      {arrow(410, 130, 470, 60, "fused grid")}
      {arrow(410, 150, 470, 165, "lagged feats")}
      {arrow(410, 175, 470, 275, "hotspots")}
      {box(690, 130, 150, 70, "LLM layer", "Claude · explain/advise", "llm")}
      {arrow(630, 55, 690, 150, "why")}
      {arrow(630, 165, 690, 165, "rationale")}
      {arrow(630, 275, 690, 180, "brief")}
      {box(700, 290, 240, 60, "Web app + Citizen channels", "officer console · SMS/app advisories", "app")}
      {arrow(765, 200, 800, 290, "advisories")}
      {arrow(550, 310, 700, 320, "action queue + clock")}
    </svg>
  );
}

/* --- Ask VAYU global slide-over --- */
function AskVayu({ city, open, onClose }) {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const samples = ["Why is " + [...city.wards].sort((a, b) => b.current - a.current)[0].name + " red right now?", "Which ward should I act on first?", "What's the 24h outlook for " + city.name + "?"];
  function context() {
    return "City: " + city.name + ". Met: " + city.met.windDir + " wind " + city.met.wind + "m/s, BLH " + city.met.blh + "m, fire load " + city.met.fireLoad + ". Wards: " +
      city.wards.map(w => w.name + " AQI " + w.current + " [" + SOURCES.map(s => s.label.split(" ")[0] + " " + Math.round(w.mix[s.key] * 100) + "%").join(", ") + "] conf " + w.confidence).join("; ") + ".";
  }
  function localAnswer(query) {
    const worst = [...city.wards].sort((a, b) => b.current - a.current)[0];
    const dom = SOURCES.map(s => ({ s, v: worst.mix[s.key] })).sort((a, b) => b.v - a.v)[0];
    return worst.name + " is the current hotspot (AQI " + worst.current + ", " + aqiBand(worst.current).label + "), driven mainly by " + dom.s.label + " (" + Math.round(dom.v * 100) + "%) — corroborated by TROPOMI NO₂ " + worst.signals.tropomi + "e15 and " + worst.signals.fires + " FIRMS detections. " + (city.met.blh < 600 ? "A shallow boundary layer (" + city.met.blh + "m) is trapping emissions." : "Dispersion is moderate.") + " Recommended: act on " + worst.name + " first.";
  }
  async function send(text) {
    const query = text || q; if (!query.trim()) return;
    setMsgs(m => [...m, { role: "user", text: query }]); setQ(""); setLoading(true);
    const sys = "You are Ask VAYU, an air-quality intelligence assistant for a city administrator. Answer in <=4 sentences using ONLY the provided context. Always cite the signal(s) behind any attribution claim. Be direct and action-oriented.";
    const res = await askClaude(sys, "CONTEXT: " + context() + "\n\nQUESTION: " + query, 400);
    setMsgs(m => [...m, { role: "vayu", text: res.live ? res.text : localAnswer(query), live: res.live }]);
    setLoading(false);
  }
  if (!open) return null;
  return (
    <div className="slideover-wrap" onClick={onClose}>
      <div className="slideover" onClick={e => e.stopPropagation()}>
        <div className="so-head"><h3>Ask VAYU</h3><button className="x" onClick={onClose}>✕</button></div>
        <div className="so-sub">Natural-language query over {city.name}'s live attribution. Cited answers.</div>
        <div className="so-body">
          {msgs.length === 0 && <div className="so-samples">{samples.map((s, i) => <button key={i} className="sample" onClick={() => send(s)}>{s}</button>)}</div>}
          {msgs.map((m, i) => <div key={i} className={"so-msg " + m.role}>{m.text}{m.role === "vayu" && !m.live && <span className="offline">offline answer</span>}</div>)}
          {loading && <div className="so-msg vayu">…</div>}
        </div>
        <div className="so-input">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about any ward, source, or forecast…" />
          <button className="btn primary sm" onClick={() => send()}>Ask</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ SHELL ============================ */
const NAV = [
  { id: "command", label: "Command Center" },
  { id: "attribution", label: "Attribution" },
  { id: "forecast", label: "Forecast" },
  { id: "enforcement", label: "Enforcement" },
  { id: "health", label: "Health Risk" },
  { id: "planner", label: "Intervention Planner" },
  { id: "multicity", label: "Multi-City" },
  { id: "arch", label: "Architecture" },
];
function App() {
  const [cityId, setCityId] = useState("delhi");
  const [page, setPage] = useState("command");
  const [actions, setActions] = useState([]);
  const [askOpen, setAskOpen] = useState(false);
  const city = cityById(cityId);
  const dispatch = useCallback(a => setActions(prev => [a, ...prev]), []);
  const go = setPage;
  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand"><div className="brand-mark">वा</div><div><div className="brand-name">VAYU-IQ</div><div className="brand-sub">air intelligence layer</div></div></div>
        <nav>{NAV.map(n => <button key={n.id} className={"nav-item " + (page === n.id ? "on" : "")} onClick={() => setPage(n.id)}>{n.label}</button>)}</nav>
        <button className="ask-fab" onClick={() => setAskOpen(true)}>✦ Ask VAYU</button>
        <div className="nav-foot">From monitoring to intervention — source-attributed, forecast-aware, enforcement-ready.</div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="city-seg">{CITIES.map(c => <button key={c.id} className={"city-btn " + (cityId === c.id ? "on" : "")} onClick={() => setCityId(c.id)}>{c.name}</button>)}</div>
          <div className="topbar-right">
            <span className="met">{city.met.windDir} {city.met.wind}m/s · BLH {city.met.blh}m · {city.met.temp}°C</span>
            <span className="live-dot" /> seeded demo data
          </div>
        </header>
        <div className="scroll">
          {page === "command" && <CommandCenter city={city} setCity={setCityId} go={go} actions={actions} dispatch={dispatch} />}
          {page === "attribution" && <Attribution city={city} />}
          {page === "forecast" && <ForecastPage city={city} />}
          {page === "enforcement" && <Enforcement city={city} actions={actions} dispatch={dispatch} />}
          {page === "health" && <Health city={city} />}
          {page === "planner" && <Planner city={city} />}
          {page === "multicity" && <MultiCity go={go} setCityId={setCityId} />}
          {page === "arch" && <Architecture />}
        </div>
      </main>
      <AskVayu city={city} open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
