import fs from "fs";
import { generateEmbeddings } from "../src/embeddings/embeddingService.js";

const chunksPath =
  "./data/processed/tomato/tomato_chunks.json";

try {
  const chunks = JSON.parse(
    fs.readFileSync(chunksPath, "utf8")
  );

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("No chunks found.");
  }

  console.log(`Loaded ${chunks.length} chunks.`);
  console.log("Generating embeddings...");

  const texts = chunks.map((chunk) => chunk.text);

  const embeddings =
    await generateEmbeddings(texts);

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Expected ${chunks.length} embeddings but received ${embeddings.length}.`
    );
  }

  console.log(
    `Total embeddings: ${embeddings.length}`
  );

  console.log(
    `Vector dimensions: ${embeddings[0].length}`
  );

  console.log(
    "First embedding preview:",
    embeddings[0].slice(0, 10)
  );

  console.log("\nBatch embedding test PASSED.");
} catch (error) {
  console.error("\nBatch embedding test FAILED:");
  console.error(error);
  process.exit(1);
}