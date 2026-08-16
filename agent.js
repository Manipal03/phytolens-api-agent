import "dotenv/config";
import { askAgent } from "./src/rag/ragAgent.js";
import { getFarm, getDefaultFarm, getUsers } from "./src/farms/farmStore.js";
import { fetchFarmContext, formatFarmContext } from "./src/rag/farmContext.js";

const args = process.argv.slice(2);
let query = args.filter((a) => !a.startsWith("--")).join(" ");
let userId = process.env.PHYTOLENS_USER_ID;
let farmId = process.env.PHYTOLENS_FARM_ID;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--user") userId = args[i + 1];
  if (args[i] === "--farm") farmId = args[i + 1];
}
query = query || "What's the current weather and soil type at this farm?";

if (!userId) {
  const users = getUsers();
  if (users.length > 0) userId = users[0].id;
}
const farm = userId ? getFarm(userId, farmId) || getDefaultFarm(userId) : undefined;

let liveContext = null;
if (farm) {
  console.log(`📍 Farm: ${farm.name} — lat ${farm.lat}, lon ${farm.lon} (user ${userId})\n`);
  try {
    const context = await fetchFarmContext(farm);
    liveContext = formatFarmContext(farm, context);
    console.log(liveContext + "\n");
  } catch (err) {
    console.warn(`⚠ Could not pre-fetch farm context: ${err.message || err}`);
  }
}

const { answer, toolCalls, sources } = await askAgent(query, { farm, liveContext });

console.log("\n--- Tool calls ---");
for (const call of toolCalls) {
  const status = call.ok ? "ok" : "ERROR";
  console.log(`  [${status}] ${call.name}(${JSON.stringify(call.args)})`);
}
if (toolCalls.length === 0) console.log("  (none)");

console.log("\n--- Knowledge base sources ---");
for (const source of sources) {
  console.log(`  [${source.score?.toFixed(3)}] ${source.source}${source.page ? ` p.${source.page}` : ""}`);
}
if (sources.length === 0) console.log("  (none)");

console.log("\n--- Answer ---\n" + answer + "\n");
