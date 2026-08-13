import fs from "fs";
import { generateEmbeddings } from "../embeddings/embeddingService.js";
import qdrant, {
  COLLECTION_NAME,
  createCollection
} from "./qdrant.js";

const CHUNKS_FILE =
  "./data/processed/tomato/tomato_chunks.json";

async function main() {
  console.log("Loading chunks...");

  const chunks = JSON.parse(
    fs.readFileSync(CHUNKS_FILE, "utf8")
  );

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("No chunks found.");
  }

  console.log(
    `Loaded ${chunks.length} chunks.`
  );

  await createCollection();

  console.log(
    "Generating embeddings..."
  );

  const texts = chunks.map(
    (chunk) => chunk.text
  );

  const embeddings =
    await generateEmbeddings(texts);

  console.log(
    `Generated ${embeddings.length} embeddings.`
  );

  const points = chunks.map(
    (chunk, index) => ({
      id: index + 1,

      vector: embeddings[index],

      payload: {
        text: chunk.text,

        crop:
          chunk.metadata.crop,

        source:
          chunk.metadata.source,

        page:
          chunk.metadata.page,

        document_type:
          chunk.metadata.document_type
      }
    })
  );

  console.log(
    "Uploading vectors to Qdrant..."
  );

  await qdrant.upsert(
    COLLECTION_NAME,
    {
      wait: true,
      points
    }
  );

  console.log(
    "\n========== INDEXING COMPLETE =========="
  );

  console.log(
    `Collection: ${COLLECTION_NAME}`
  );

  console.log(
    `Vectors indexed: ${points.length}`
  );

  console.log(
    "======================================="
  );
}

main().catch((error) => {
  console.error(
    "\nIndexing failed:"
  );

  console.error(error);

  process.exit(1);
});