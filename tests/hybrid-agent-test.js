import { askAgent } from "../src/rag/ragAgent.js";

const queries = [
  // API + docs
  "What's the current weather at the farm, and what does the tomato guide recommend for irrigation?",
  // API + docs
  "What soil type does the farm have, and what does the guide say about ideal soil for tomatoes?",
  // API + docs
  "Based on the recent satellite data, is the vegetation at the farm healthy, and what does the guide say about common diseases to watch for?",
  // docs only
  "What are the benefits of protected cultivation for tomatoes?",
  // API + docs
  "Should I irrigate my tomatoes today given the current weather, and what does the tomato guide recommend for irrigation?",
];

for (const query of queries) {
  console.log("\n================================================");
  console.log("QUERY:", query);
  console.log("================================================");

  const started = Date.now();
  const { answer, toolCalls, sources } = await askAgent(query);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n[tools used] ${toolCalls.length ? toolCalls.map((c) => c.name).join(", ") : "none"} (${seconds}s)`);
  for (const call of toolCalls) {
    const status = call.ok ? "ok" : "ERROR";
    console.log(`  [${status}] ${call.name}(${JSON.stringify(call.args).slice(0, 120)})`);
  }

  console.log(`\n[knowledge sources] ${sources.length}`);
  for (const source of sources) {
    console.log(`  [${source.score?.toFixed(3)}] ${source.source}${source.page ? ` p.${source.page}` : ""} (${source.document_type})`);
  }

  console.log("\n--- ANSWER ---");
  console.log(answer);
  console.log("--------------");
}
