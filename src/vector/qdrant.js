import { QdrantClient } from "@qdrant/js-client-rest";

const qdrant = new QdrantClient({
  url: "http://localhost:6333"
});

export const COLLECTION_NAME = "tomato_knowledge";

export async function createCollection() {
  const collections = await qdrant.getCollections();

  const exists = collections.collections.some(
    (collection) =>
      collection.name === COLLECTION_NAME
  );

  if (exists) {
    console.log(
      `Collection "${COLLECTION_NAME}" already exists.`
    );
    return;
  }

  await qdrant.createCollection(
    COLLECTION_NAME,
    {
      vectors: {
        size: 768,
        distance: "Cosine"
      }
    }
  );

  console.log(
    `Created collection: ${COLLECTION_NAME}`
  );
}

export default qdrant;