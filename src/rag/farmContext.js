import { getWeather, getSoilType, getSatelliteAnalysis } from "../../tools.js";

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

async function safe(label, fn) {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Fetch live weather, soil and satellite (compacted to NDVI averages) for a
 * farm in parallel. Each call degrades gracefully: a failed source is reported
 * as { ok: false } instead of failing the whole conversation.
 */
export async function fetchFarmContext(farm) {
  const [weather, soil, satellite] = await Promise.all([
    safe("weather", () => getWeather({ lat: farm.lat, lon: farm.lon })),
    safe("soil", () => getSoilType({ lat: farm.lat, lon: farm.lon })),
    safe("satellite", () => getSatelliteAnalysis({ geojson: farm.geojson })),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    weather,
    soil,
    satellite: satellite.ok ? { ok: true, data: compactSatellite(satellite.data) } : satellite,
  };
}

function weatherLine(weather) {
  if (!weather?.ok || !weather.data) return "Weather: unavailable — say so and offer to call get_weather.";
  const c = weather.data.current || {};
  const parts = [
    `temperature ${c.temperature_2m}°C`,
    `humidity ${c.relative_humidity_2m}%`,
    `wind ${c.wind_speed_10m} km/h`,
    `precipitation ${c.precipitation} mm`,
    `cloud cover ${c.cloud_cover}%`,
    `soil temp 0cm ${c.soil_temperature_0cm}°C`,
    `soil moisture 0-1cm ${c.soil_moisture_0_to_1cm} m³/m³`,
  ].filter((p) => !/undefined|NaN|null/.test(p));
  return `Weather: ${parts.join(", ")}`;
}

function soilLine(soil) {
  if (!soil?.ok || !soil.data) return "Soil: unavailable — say so and offer to call get_soil_type.";
  const t = soil.data.topsoil || {};
  const parts = [
    t.texture_class && `texture ${t.texture_class}`,
    t.ph_h2o != null && `pH ${t.ph_h2o}`,
    t.sand_pct != null && `sand ${t.sand_pct}% / silt ${t.silt_pct}% / clay ${t.clay_pct}%`,
    t.organic_carbon_g_per_kg != null && `organic carbon ${t.organic_carbon_g_per_kg} g/kg`,
  ].filter(Boolean);
  return `Soil (0-5cm): ${parts.join(", ")}`;
}

function satelliteLine(satellite) {
  if (!satellite?.ok) return "Satellite/NDVI: unavailable — say so and offer to call get_satellite_analysis.";
  const data = satellite.data;
  if (!data || typeof data !== "object") return "Satellite/NDVI: unavailable.";

  const note = data._fallback ? ` (${data._fallback})` : "";
  const parts = [];
  for (const source of ["sentinel2", "sentinel1", "landsat", "modis", "smap", "chirps", "nasaPower"]) {
    const rec = data[source];
    if (!rec || typeof rec !== "object" || !rec.averages) continue;
    const avg = rec.averages;
    const idx = Object.entries(avg)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    if (!idx) continue; // e.g. CHIRPS/NASA POWER series with no numeric indices
    parts.push(`${source} (${rec.observations} obs${rec.date_range ? `, ${rec.date_range[0]}→${rec.date_range[1]}` : ""}): ${idx}`);
  }
  if (parts.length === 0) return "Satellite/NDVI: no usable series returned.";
  return `Satellite: ${parts.join("; ")}${note}`;
}

/** Build the human-readable live-condition block injected into the system prompt. */
export function formatFarmContext(farm, context) {
  const farmDesc = [
    farm.name && `Farm: ${farm.name}`,
    farm.crop && `crop: ${farm.crop}`,
    farm.area_acres != null && `${farm.area_acres} acres`,
  ].filter(Boolean).join(" · ");

  return [
    `FARM CONTEXT — ${farmDesc}`,
    `GPS: lat ${farm.lat}, lon ${farm.lon}`,
    "",
    `LIVE CONDITIONS (fetched ${context.fetchedAt}) — trust these values, do not re-call the same tool for them:`,
    weatherLine(context.weather),
    soilLine(context.soil),
    satelliteLine(context.satellite),
  ].join("\n");
}
