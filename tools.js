import { retrieve } from "./src/retrieval/retriever.js";

const RS_BASE = process.env.REMOTE_SENSING_BASE_URL;

export async function getWeather({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,surface_pressure,precipitation,shortwave_radiation,soil_temperature_0cm,soil_moisture_0_to_1cm`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  return res.json();
}

const SOILGRIDS_PROPERTIES = ["sand", "clay", "silt", "phh2o", "soc"];

/** SoilGrids computes queries on demand and can be slow/503 under load — retry. */
async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let retryable = false;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return res;
      lastErr = new Error(`Soil API error: ${res.status}`);
      retryable = res.status === 429 || res.status === 502 || res.status === 503;
    } catch (err) {
      lastErr = err.name === "AbortError" ? new Error("Soil API timed out") : err;
      retryable = true; // network blips and timeouts are worth retrying
    } finally {
      clearTimeout(timer);
    }
    if (!retryable || i === attempts - 1) throw lastErr;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
  }
  throw lastErr;
}

/**
 * USDA soil texture triangle (sand/silt/clay in %) → one of 12 texture classes.
 * Classic NRCS boundary rules; silt = 100 - sand - clay.
 */
export function usdaTextureClass(sand, silt, clay) {
  if (silt + 1.5 * clay < 15) return "sand";
  if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return "loamy sand";
  if (
    (clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) ||
    (clay < 7 && silt < 50 && silt + 2 * clay >= 30)
  ) return "sandy loam";
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "loam";
  if (
    (silt >= 50 && clay >= 12 && clay < 27) ||
    (silt >= 50 && silt < 80 && clay < 12)
  ) return "silt loam";
  if (silt >= 80 && clay < 12) return "silt";
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "sandy clay loam";
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "clay loam";
  if (clay >= 27 && clay < 40 && sand <= 20) return "silty clay loam";
  if (clay >= 35 && sand > 45) return "sandy clay";
  if (clay >= 40 && silt >= 40) return "silty clay";
  if (clay >= 40 && sand <= 45 && silt < 40) return "clay";
  return "unknown";
}

export async function getSoilType({ lat, lon }) {
  // OpenLandMap's point API dropped its USDA great-group layer, so use ISRIC
  // SoilGrids v2.0 instead: open data, no API key, returns texture + pH + SOC.
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}` +
    SOILGRIDS_PROPERTIES.map((p) => `&property=${p}`).join("") +
    "&depth=0-5cm";
  const res = await fetchWithRetry(url);
  const data = await res.json();

  // SoilGrids returns each property per depth with mean + prediction intervals;
  // texture/pH values are in g/kg (or /10) so divide by the layer's d_factor.
  const means = {};
  for (const layer of data.properties?.layers || []) {
    const depth = (layer.depths || [])[0];
    const mean = depth?.values?.mean ?? depth?.values?.["Q0.5"];
    if (mean != null) {
      const factor = layer.unit_measure?.d_factor || 1;
      means[layer.name] = +(mean / factor).toFixed(1);
    }
  }

  const { sand, silt, clay } = means;
  const textureClass =
    [sand, silt, clay].every((v) => typeof v === "number")
      ? usdaTextureClass(sand, silt, clay)
      : null;

  return {
    source: "ISRIC SoilGrids v2.0 (open data, no API key)",
    lat: +lat,
    lon: +lon,
    topsoil: {
      depth: "0-5cm",
      texture_class: textureClass,
      sand_pct: sand,
      silt_pct: silt,
      clay_pct: clay,
      ph_h2o: means.phh2o,
      organic_carbon_g_per_kg: means.soc,
    },
  };
}

const MODIS_NDVI_BASE = "https://modis.ornl.gov/rst/api/v1";

/** YYYY-MM-DD -> MODIS DOY date (A2021001). Returns null for invalid input. */
function isoToMODISDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const doy = Math.floor((d - Date.UTC(year, 0, 1)) / 86400000) + 1;
  return `A${year}${String(doy).padStart(3, "0")}`;
}

/** Centroid (lon/lat) of a GeoJSON polygon; falls back to the first ring point. */
function centroidOf(geojson) {
  try {
    const ring = geojson?.geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    let sumLon = 0;
    let sumLat = 0;
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
    }
    return { lon: sumLon / ring.length, lat: sumLat / ring.length };
  } catch {
    return null;
  }
}

/**
 * Open-data fallback: NASA MODIS MOD13Q1 (16-day NDVI, 250 m) via the ORNL DAAC
 * REST service — no API key. Returns the same per-source records shape as the
 * PhytoLens backend so compactSatellite() works on it unchanged.
 */
async function fetchMODISNdvi(lat, lon, startDate, endDate) {
  const start = isoToMODISDate(startDate);
  const end = isoToMODISDate(endDate);
  if (!start || !end) throw new Error("MODIS fallback needs a valid date range");
  const url =
    `${MODIS_NDVI_BASE}/MOD13Q1/subset?latitude=${lat}&longitude=${lon}` +
    `&startDate=${start}&endDate=${end}&band=250m_16_days_NDVI&kmAboveBelow=0&kmLeftRight=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MODIS NDVI API error: ${res.status}`);
  const data = await res.json();
  const scale = parseFloat(data.scale || "0.0001") || 0.0001;
  const subsets = Array.isArray(data.subset) ? data.subset : [];
  const records = [];
  for (const s of subsets) {
    const date = s.calendar_date || s.modis_date;
    const value = Array.isArray(s.data) ? s.data[0] : s.value;
    if (date && typeof value === "number" && value > 0) {
      records.push({ date, ndvi: +(value * scale).toFixed(3) });
    }
  }
  if (records.length === 0) throw new Error("MODIS returned no valid NDVI values");
  return {
    modis: records,
    _fallback: "NASA MODIS MOD13Q1 (ORNL DAAC) NDVI — open data, no API key (PhytoLens backend unavailable)",
  };
}

export async function getSatelliteAnalysis({ geojson, startDate, endDate }) {
  if (!startDate || !endDate) {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 6);
    startDate = startDate || start.toISOString().slice(0, 10);
    endDate = endDate || end.toISOString().slice(0, 10);
  }
  const body = JSON.stringify({ geojson, startDate, endDate });
  const baseHeaders = { "Content-Type": "application/json" };
  const key = process.env.REMOTE_SENSING_API_KEY;
  const hasKey = key && key !== "your-key-here";

  // 1) PhytoLens remote-sensing backend, with the API key if one is configured.
  if (RS_BASE && hasKey) {
    const res = await fetch(`${RS_BASE}/analyze-all`, {
      method: "POST",
      headers: { ...baseHeaders, Authorization: `Bearer ${key}` },
      body,
    });
    if (res.ok) return res.json();
  }

  // 2) Retry the same backend without a key (the live service currently needs none).
  if (RS_BASE) {
    const res = await fetch(`${RS_BASE}/analyze-all`, {
      method: "POST",
      headers: baseHeaders,
      body,
    });
    if (res.ok) return res.json();
  }

  // 3) Open fallback: NASA MODIS NDVI at the farm centroid (keyless, always available).
  const center = centroidOf(geojson);
  if (center) {
    return fetchMODISNdvi(center.lat, center.lon, startDate, endDate);
  }
  throw new Error("Satellite APIs unavailable and no farm geometry for MODIS fallback");
}

export async function searchKnowledgeBase({ query, limit = 3 }) {
  // Models sometimes pass numbers as strings (e.g. "3") — coerce defensively.
  const n = Math.min(Math.max(parseInt(limit, 10) || 3, 1), 10);
  const results = await retrieve(query, n);

  return results.map((result) => ({
    score: result.score,
    source: result.payload?.source,
    page: result.payload?.page,
    document_type: result.payload?.document_type,
    text: result.payload?.text,
  }));
}

export const toolImpl = {
  get_weather: getWeather,
  get_soil_type: getSoilType,
  get_satellite_analysis: getSatelliteAnalysis,
  search_knowledge_base: searchKnowledgeBase,
};

export const toolSchemas = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a farm location: temperature, humidity, wind, precipitation, surface soil moisture/temp.",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude" },
          lon: { type: "number", description: "Longitude" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_soil_type",
      description: "Get the USDA soil texture class and topsoil properties (sand/silt/clay %, pH, organic carbon) for a farm location, from ISRIC SoilGrids.",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude" },
          lon: { type: "number", description: "Longitude" },
        },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_satellite_analysis",
      description: "Get satellite-derived vegetation and environmental indices (Sentinel-2, Sentinel-1, Landsat, MODIS, SMAP, CHIRPS, NASA POWER) for the farm's boundary. If the user doesn't specify a date range, call this with no startDate/endDate and a sensible default (last 6 months) will be used. Use for crop health, NDVI, or historical field condition questions.",
      parameters: {
        type: "object",
        properties: {
          geojson: { type: "object", description: "GeoJSON Feature polygon of the farm boundary" },
          startDate: { type: "string", description: "YYYY-MM-DD, optional" },
          endDate: { type: "string", description: "YYYY-MM-DD, optional" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Search the tomato farming knowledge base (ICAR tomato cultivation guide, protected cultivation research paper, and tomato diseases guide) for relevant excerpts. Use for questions about cultivation practices, soil requirements, planting, spacing, irrigation, fertilizer, pests, diseases, yield, harvest, and protected cultivation.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language search query about tomato farming" },
          limit: { type: "number", description: "Max results to return (default 3)" },
        },
        required: ["query"],
      },
    },
  },
];
