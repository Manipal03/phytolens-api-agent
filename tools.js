import { retrieve } from "./src/retrieval/retriever.js";

const RS_BASE = process.env.REMOTE_SENSING_BASE_URL;

export async function getWeather({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,surface_pressure,precipitation,shortwave_radiation,soil_temperature_0cm,soil_moisture_0_to_1cm`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  return res.json();
}

export async function getSoilType({ lat, lon }) {
  const url = `https://api.openlandmap.org/query/point?lat=${lat}&lon=${lon}&coll=predicted250m&regex=grtgroup`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Soil API error: ${res.status}`);
  return res.json();
}

export async function getSatelliteAnalysis({ geojson, startDate, endDate }) {
  const res = await fetch(`${RS_BASE}/analyze-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geojson, startDate, endDate }),
  });
  if (!res.ok) throw new Error(`Satellite API error: ${res.status}`);
  return res.json();
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
      description: "Get the USDA soil taxonomy classification for a farm location.",
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
      description: "Search the tomato farming knowledge base (ICAR tomato cultivation guide and protected cultivation research paper) for relevant excerpts. Use for questions about cultivation practices, soil requirements, planting, spacing, irrigation, fertilizer, pests, diseases, yield, harvest, and protected cultivation.",
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
