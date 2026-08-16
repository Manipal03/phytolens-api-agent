import "dotenv/config";
import { getFarm, getDefaultFarm } from "./src/farms/farmStore.js";
import { fetchFarmContext, formatFarmContext } from "./src/rag/farmContext.js";

const userId = process.env.PHYTOLENS_USER_ID;
const farmId = process.env.PHYTOLENS_FARM_ID;
const farm = userId ? getFarm(userId, farmId) || getDefaultFarm(userId) : null;

if (!farm) {
  console.error(JSON.stringify({ error: "No farm found. Set PHYTOLENS_USER_ID (and optionally PHYTOLENS_FARM_ID)." }));
  process.exit(1);
}

try {
  const context = await fetchFarmContext(farm);
  console.log(
    JSON.stringify({
      farm: { id: farm.id, name: farm.name, crop: farm.crop, lat: farm.lat, lon: farm.lon, area_acres: farm.area_acres },
      fetchedAt: context.fetchedAt,
      context: formatFarmContext(farm, context),
    })
  );
} catch (err) {
  console.error(JSON.stringify({ error: String(err?.message || err) }));
  process.exit(1);
}
