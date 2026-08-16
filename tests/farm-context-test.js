import { getUsers, getFarms, getFarm, geojsonFromPoint } from "../src/farms/farmStore.js";
import { buildSystemPrompt, DEMO_FARM } from "../src/rag/ragAgent.js";
import { formatFarmContext, compactSatellite } from "../src/rag/farmContext.js";

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  if (!cond) failures++;
}

// ---- farm store ----
const users = getUsers();
check("farm store has 2 seeded users", users.length === 2);

const farmA = getFarms(users[0].id)[0];
const farmB = getFarms(users[1].id)[0];
check("user 1 has farms", farmA != null);
check("user 2 has farms", farmB != null);
check("different GPS between users' farms", farmA && farmB && (farmA.lat !== farmB.lat || farmA.lon !== farmB.lon));
check("farm has geojson polygon", farmA?.geojson?.geometry?.type === "Polygon");
check("getFarm returns null for unknown id", getFarm("user-1", "nope") === null);

const generated = geojsonFromPoint(18.09, 79.46);
check("geojsonFromPoint builds a closed square", generated.geometry.coordinates[0].length === 5);
const [ringLon, ringLat] = generated.geometry.coordinates[0][0];
check(
  "geojsonFromPoint centers on lat/lon",
  ringLon.toFixed(3) === "79.459" && ringLat.toFixed(3) === "18.091"
);

// ---- system prompt ----
const promptA = buildSystemPrompt(farmA);
const promptB = buildSystemPrompt(farmB);
check("system prompt embeds farm A lat/lon", farmA && promptA.includes(String(farmA.lat)) && promptA.includes(String(farmA.lon)));
check("system prompt embeds farm B lat/lon", farmB && promptB.includes(String(farmB.lat)) && promptB.includes(String(farmB.lon)));
check("system prompt differs between farms", promptA !== promptB);

const liveContext = formatFarmContext(farmA, {
  fetchedAt: "2026-08-16T10:00:00.000Z",
  weather: {
    ok: true,
    data: { current: { temperature_2m: 28, relative_humidity_2m: 62, wind_speed_10m: 8, precipitation: 0.2, cloud_cover: 30, soil_temperature_0cm: 26, soil_moisture_0_to_1cm: 0.12 } },
  },
  soil: {
    ok: true,
    data: { topsoil: { texture_class: "loam", ph_h2o: 6.8, sand_pct: 40, silt_pct: 40, clay_pct: 20, organic_carbon_g_per_kg: 1.2 } },
  },
  satellite: {
    ok: true,
    data: compactSatellite({
      sentinel2: [
        { date: "2026-02-01", ndvi: 0.6, evi: 0.3 },
        { date: "2026-03-01", ndvi: 0.7, evi: 0.4 },
      ],
    }),
  },
});
check("formatted context includes GPS", liveContext.includes("GPS: lat 18.090829, lon 79.465273"));
check("formatted context includes weather", liveContext.includes("temperature 28°C"));
check("formatted context includes soil texture", liveContext.includes("texture loam"));
check("formatted context includes NDVI average", liveContext.includes("ndvi 0.65"));

const promptWithContext = buildSystemPrompt(farmA, liveContext);
check("system prompt includes the live-context block", promptWithContext.includes("CURRENT FARM CONDITIONS") || promptWithContext.includes("LIVE CONDITIONS"));
check("system prompt still names the farm", promptWithContext.includes(farmA.name));

// ---- graceful degradation ----
const degraded = formatFarmContext(farmA, {
  fetchedAt: "2026-08-16T10:00:00.000Z",
  weather: { ok: false, error: "boom" },
  soil: { ok: false, error: "boom" },
  satellite: { ok: false, error: "boom" },
});
check("degraded context tells the model to fall back to tools", /unavailable/i.test(degraded) && degraded.includes("get_weather"));

// ---- compactSatellite ----
const compacted = compactSatellite({
  sentinel2: [
    { date: "2026-02-01", ndvi: 0.6 },
    { date: "2026-03-01", ndvi: 0.7 },
  ],
});
check("compactSatellite averages NDVI", compacted.sentinel2.averages.ndvi === 0.65);
check("compactSatellite counts observations", compacted.sentinel2.observations === 2);

console.log(failures === 0 ? "\nAll farm-context tests passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
