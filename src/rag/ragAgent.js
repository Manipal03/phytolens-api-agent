import "dotenv/config";
import { Ollama } from "ollama";
import { toolSchemas, toolImpl } from "../../tools.js";

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || "http://localhost:11434" });
const MODEL = process.env.OLLAMA_MODEL || "qwen3.5:latest";
// Used when the configured model can't fit in available memory (common on laptops).
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || "llama3.2:latest";

let activeModel = MODEL;

async function chatWithModel(messages) {
  try {
    return await ollama.chat({ model: activeModel, messages, tools: toolSchemas });
  } catch (err) {
    const isMemoryIssue = /memory/i.test(String(err?.message || err));
    if (isMemoryIssue && activeModel !== FALLBACK_MODEL) {
      console.warn(`[ragAgent] ${activeModel} couldn't load (${err.message}). Falling back to ${FALLBACK_MODEL}.`);
      activeModel = FALLBACK_MODEL;
      return ollama.chat({ model: activeModel, messages, tools: toolSchemas });
    }
    throw err;
  }
}

export const DEMO_FARM = {
  geojson: {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [79.465273, 18.090829],
        [79.465868, 18.090835],
        [79.465782, 18.090121],
        [79.465273, 18.090829],
      ]],
    },
    properties: {},
  },
  lat: 18.090829,
  lon: 79.465273,
};

export function buildSystemPrompt(farm = DEMO_FARM) {
  return `You are PhytoLens AI's farm advisory assistant. This farmer's field is located at lat ${farm.lat}, lon ${farm.lon}. Use the available tools to fetch live weather, soil, and satellite data when a question needs it, and search the tomato knowledge base for cultivation guidance. For questions about farming practices (irrigation, planting, spacing, fertilizer, pests, diseases, soil prep, yields, protected cultivation), search the knowledge base too — even when you also call a live-data tool. Always ground your answer in the tool results and cite the specific values you used. If a tool fails or returns nothing useful, say so instead of guessing.`;
}

function normalizeGeojson(value, farm) {
  let geo = value;
  if (typeof geo === "string") {
    try { geo = JSON.parse(geo); } catch { geo = null; }
  }
  if (geo && geo.type === "FeatureCollection" && Array.isArray(geo.features) && geo.features.length > 0) {
    geo = geo.features[0];
  }
  return geo && geo.type === "Feature" ? geo : farm.geojson;
}

function fillDefaults(name, args, farm) {
  if (name === "get_satellite_analysis") {
    args.geojson = normalizeGeojson(args.geojson, farm);
    if (!args.startDate || !args.endDate) {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      args.startDate = args.startDate || start.toISOString().slice(0, 10);
      args.endDate = args.endDate || end.toISOString().slice(0, 10);
    }
  }
  if ((name === "get_weather" || name === "get_soil_type") && !args.lat) {
    args.lat = farm.lat;
    args.lon = farm.lon;
  }
  if (name === "search_knowledge_base" && !args.limit) {
    args.limit = 3;
  }
}

/**
 * Run the tool-calling agent on a user message.
 * Returns { answer, toolCalls, sources } where:
 *  - toolCalls: [{ name, args, ok, result }] — every tool invocation with a truncated result
 *  - sources:   [{ score, source, page, document_type, text }] — chunks pulled from the knowledge base
 */
export async function askAgent(userMessage, { maxSteps = 5, farm = DEMO_FARM } = {}) {
  const messages = [
    { role: "system", content: buildSystemPrompt(farm) },
    { role: "user", content: userMessage },
  ];

  const toolCalls = [];
  const sources = [];

  for (let step = 0; step < maxSteps; step++) {
    const response = await chatWithModel(messages);

    const msg = response.message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { answer: msg.content, toolCalls, sources };
    }

    for (const call of msg.tool_calls) {
      const name = call.function.name;
      const args = call.function.arguments || {};
      fillDefaults(name, args, farm);

      let ok = true;
      let result;
      try {
        result = await toolImpl[name](args);
        if (name === "search_knowledge_base" && Array.isArray(result)) {
          sources.push(...result);
        }
      } catch (err) {
        ok = false;
        result = { error: String(err) };
      }

      toolCalls.push({
        name,
        args,
        ok,
        result: truncateResult(result),
        compact: name === "get_satellite_analysis" ? compactSatellite(result) : undefined,
      });

      messages.push({ role: "tool", content: compactForModel(name, result) });
    }
  }

  return {
    answer: "Reached max tool-call steps without a final answer.",
    toolCalls,
    sources,
  };
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n...[truncated ${text.length - maxChars} chars]`;
}

function truncateResult(result, maxChars = 2000) {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  return truncateText(text, maxChars);
}

/**
 * The satellite API returns ~20k chars of per-date index series (sentinel2,
 * sentinel1, modis, landsat, smap, chirps, nasaPower). That floods a small
 * model's context, so we compact each source to its observation count, date
 * range, and per-index averages — still real numbers the model can cite.
 */
export function compactSatellite(result) {
  if (!result || typeof result !== "object") return result;

  const out = {};
  for (const [source, records] of Object.entries(result)) {
    if (!Array.isArray(records) || records.length === 0) {
      out[source] = records;
      continue;
    }

    const dates = records.map((r) => r?.date).filter(Boolean);
    const numeric = {};
    for (const rec of records) {
      for (const [key, value] of Object.entries(rec)) {
        if (key === "date" || typeof value !== "number") continue;
        (numeric[key] ||= []).push(value);
      }
    }

    const averages = {};
    for (const [key, values] of Object.entries(numeric)) {
      averages[key] = +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(3);
    }

    out[source] = {
      observations: records.length,
      date_range: dates.length > 0 ? [dates[0], dates[dates.length - 1]] : null,
      averages,
    };
  }
  return out;
}

function compactForModel(name, result) {
  const raw = JSON.stringify(result);
  if (raw.length <= 6000) return raw;
  if (name === "get_satellite_analysis") return JSON.stringify(compactSatellite(result));
  return truncateText(raw, 6000);
}
