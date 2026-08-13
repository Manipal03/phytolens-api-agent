import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "processed",
  "tomato"
);

const OUTPUT_FILE = path.join(
  DATA_DIR,
  "tomato_chunks.json"
);

const TARGET_WORDS = 500;
const OVERLAP_WORDS = 80;

function cleanText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text) {
  const words = text.split(/\s+/).filter(Boolean);

  const chunks = [];

  let start = 0;

  while (start < words.length) {
    const end = Math.min(
      start + TARGET_WORDS,
      words.length
    );

    const chunkWords = words.slice(start, end);

    if (chunkWords.length > 0) {
      chunks.push(chunkWords.join(" "));
    }

    if (end >= words.length) {
      break;
    }

    start = end - OVERLAP_WORDS;
  }

  return chunks;
}

function getPageFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter(
      (file) =>
        file.endsWith("_pages.json")
    );
}

function createChunksFromDocument(pageFile) {
  const filePath = path.join(
    DATA_DIR,
    pageFile
  );

  const pages = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  const chunks = [];

  for (const page of pages) {
    const text = cleanText(
      page.text || ""
    );

    if (!text) {
      continue;
    }

    const pageChunks =
      splitIntoChunks(text);

    pageChunks.forEach(
      (chunkText, index) => {
        chunks.push({
          id: `${page.id}_chunk_${index + 1}`,

          text: chunkText,

          metadata: {
            crop: page.metadata.crop,
            source: page.metadata.source,
            page: page.metadata.page,
            document_type:
              page.metadata.document_type
          }
        });
      }
    );
  }

  return chunks;
}

function main() {
  const pageFiles =
    getPageFiles();

  if (pageFiles.length === 0) {
    console.error(
      "No *_pages.json files found."
    );

    process.exit(1);
  }

  console.log(
    `Found ${pageFiles.length} page document(s).`
  );

  const allChunks = [];

  for (const pageFile of pageFiles) {
    console.log(
      `Processing: ${pageFile}`
    );

    const chunks =
      createChunksFromDocument(
        pageFile
      );

    console.log(
      `Created ${chunks.length} chunks`
    );

    allChunks.push(...chunks);
  }

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      allChunks,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    "\n========== CHUNKING SUMMARY =========="
  );

  console.log(
    `Total chunks: ${allChunks.length}`
  );

  console.log(
    `Target chunk size: ${TARGET_WORDS} words`
  );

  console.log(
    `Overlap: ${OVERLAP_WORDS} words`
  );

  console.log(
    `Output: ${OUTPUT_FILE}`
  );

  console.log(
    "======================================="
  );
}

main();