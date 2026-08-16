import "dotenv/config";
import { askAgent } from "./src/rag/ragAgent.js";
import { getFarm, getDefaultFarm } from "./src/farms/farmStore.js";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

const argQuestion = process.argv.slice(2).join(" ");
const payload = { question: argQuestion, userId: undefined, farmId: undefined, liveContext: undefined, history: undefined };

if (!process.stdin.isTTY) {
  const input = await readStdin();
  if (input.trim()) {
    try {
      Object.assign(payload, JSON.parse(input));
    } catch {
      // Not JSON — fall back to plain argv question.
    }
  }
}

const question = payload.question || argQuestion;

if (!question) {
  console.error(JSON.stringify({ error: "No question provided." }));
  process.exit(1);
}

const userId = payload.userId || process.env.PHYTOLENS_USER_ID;
const farmId = payload.farmId || process.env.PHYTOLENS_FARM_ID;
const farm = userId ? getFarm(userId, farmId) || getDefaultFarm(userId) : undefined;

try {
  const { answer, toolCalls, sources } = await askAgent(question, {
    farm,
    liveContext: payload.liveContext || process.env.PHYTOLENS_LIVE_CONTEXT || null,
    history: Array.isArray(payload.history) ? payload.history : [],
  });
  console.log(
    JSON.stringify({
      answer,
      toolCalls,
      sources,
      farm: farm ? { id: farm.id, name: farm.name, lat: farm.lat, lon: farm.lon } : null,
    })
  );
} catch (err) {
  console.error(JSON.stringify({ error: String(err?.message || err) }));
  process.exit(1);
}
