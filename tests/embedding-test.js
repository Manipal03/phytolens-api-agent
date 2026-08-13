import { generateEmbedding } from "../src/embeddings/embeddingService.js";

const text =
  "Tomato grows well in suitable soil with proper irrigation and nutrient management.";

try {
  const embedding = await generateEmbedding(text);

  console.log("Embedding generated successfully.");
  console.log("Vector dimensions:", embedding.length);
  console.log("First 10 values:", embedding.slice(0, 10));
} catch (error) {
  console.error("Embedding test failed:");
  console.error(error);
  process.exit(1);
}