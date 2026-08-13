import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "processed",
  "tomato"
);

const OUTPUT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "processed",
  "tomato"
);

function cleanText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createDocumentObject(fileName, text) {
  const isResearchPaper = fileName
    .toLowerCase()
    .includes("protected");

  return {
    document_id: path.basename(fileName, ".txt"),
    crop: "tomato",
    source: fileName,
    document_type: isResearchPaper
      ? "research_paper"
      : "production_guide",
    text: cleanText(text)
  };
}

function processDocuments() {
  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((file) => file.endsWith(".txt"));

  if (files.length === 0) {
    console.error("No extracted text files found.");
    process.exit(1);
  }

  const documents = [];

  for (const file of files) {
    const filePath = path.join(INPUT_DIR, file);
    const text = fs.readFileSync(filePath, "utf8");

    const document = createDocumentObject(file, text);

    documents.push(document);

    console.log(
      `${file} → ${document.text.length} characters`
    );
  }

  const outputPath = path.join(
    OUTPUT_DIR,
    "tomato_documents.json"
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(documents, null, 2),
    "utf8"
  );

  console.log("\nDocument processing complete.");
  console.log(`Saved: ${outputPath}`);
}

processDocuments();