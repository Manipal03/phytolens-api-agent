import "dotenv/config";
import { askAgent } from "./src/rag/ragAgent.js";

const query = process.argv.slice(2).join(" ") || "What's the current weather and soil type at this farm?";

const { answer, toolCalls, sources } = await askAgent(query);

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
