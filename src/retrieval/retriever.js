import { generateEmbedding } from "../embeddings/embeddingService.js";
import qdrant, { COLLECTION_NAME } from "../vector/qdrant.js";

export async function retrieve(query, limit = 5) {
  if (!query || !query.trim()) {
    throw new Error("Query cannot be empty.");
  }

  // 1. Embed the query with the same model used at index time
  const queryVector = await generateEmbedding(query);

  // 2. Search Qdrant using the current query API
  const response = await qdrant.query(COLLECTION_NAME, {
    query: queryVector,
    limit,
    with_payload: true
  });

  return response.points || [];
}
