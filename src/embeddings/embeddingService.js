import ollama from "ollama";

const EMBEDDING_MODEL = "nomic-embed-text:latest";

export async function generateEmbedding(text) {
  if (!text || !text.trim()) {
    throw new Error("Cannot generate embedding for empty text.");
  }

  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: text
  });

  if (!response.embeddings || !response.embeddings[0]) {
    throw new Error("Ollama returned no embedding.");
  }

  return response.embeddings[0];
}

export async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("No texts provided for embedding.");
  }

  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: texts
  });

  if (!response.embeddings) {
    throw new Error("Ollama returned no embeddings.");
  }

  return response.embeddings;
}