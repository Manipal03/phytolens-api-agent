import ollama from "ollama";
import qdrant, {
  COLLECTION_NAME
} from "../vector/qdrant.js";

const EMBEDDING_MODEL =
  "nomic-embed-text:latest";

export async function retrieve(
  query,
  limit = 5
) {
  if (!query || !query.trim()) {
    throw new Error(
      "Query cannot be empty."
    );
  }

  // 1. Convert user query into a 768-dimensional vector
  const embeddingResponse =
    await ollama.embed({
      model: EMBEDDING_MODEL,
      input: query
    });

  const queryVector =
    embeddingResponse.embeddings[0];

  // 2. Search Qdrant using the current query API
  const response = await qdrant.query(
    COLLECTION_NAME,
    {
      query: queryVector,
      limit,
      with_payload: true
    }
  );

  // Qdrant returns the matching points
  return response.points || [];
}