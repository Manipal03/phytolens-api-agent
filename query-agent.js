import "dotenv/config";
import { askAgent } from "./src/rag/ragAgent.js";

const query = process.argv.slice(2).join(" ");

if (!query) {
  console.error(JSON.stringify({ error: "No question provided." }));
  process.exit(1);
}

try {
  const { answer, toolCalls, sources } = await askAgent(query);
  console.log(JSON.stringify({ answer, toolCalls, sources }));
} catch (err) {
  console.error(JSON.stringify({ error: String(err?.message || err) }));
  process.exit(1);
}
