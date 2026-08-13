import { retrieve } from "../src/retrieval/retriever.js";

const queries = [
  "What type of soil is suitable for tomato cultivation?",
  "What is the recommended spacing for tomato plants?",
  "What are the irrigation requirements for tomato?",
  "What diseases affect tomato plants?",
  "What are the benefits of protected cultivation for tomato?"
];

for (const query of queries) {
  console.log("\n========================================");
  console.log("QUERY:", query);
  console.log("========================================");

  try {
    const results =
      await retrieve(query, 3);

    results.forEach(
      (result, index) => {
        console.log(
          `\nRESULT ${index + 1}`
        );

        console.log(
          "Score:",
          result.score
        );

        console.log(
          "Source:",
          result.payload?.source
        );

        console.log(
          "Page:",
          result.payload?.page
        );

        console.log(
          "Document type:",
          result.payload?.document_type
        );

        console.log(
          "Text:",
          result.payload?.text
        );
      }
    );
  } catch (error) {
    console.error(
      "Retrieval failed:",
      error
    );
  }
}