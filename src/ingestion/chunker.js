import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "..", "data", "processed", "tomato");
const OUTPUT_FILE = path.join(DATA_DIR, "tomato_chunks.json");

const TARGET_WORDS = 500;
const OVERLAP_WORDS = 80;

function getPageFiles() {
  return fs.readdirSync(DATA_DIR).filter((file) => file.endsWith("_pages.json"));
}

/**
 * Chunk a whole document (not page by page) so passages that run across a
 * page break stay together and the overlap actually applies. Each word keeps
 * the page it came from; a chunk is cited by the page it starts on.
 */
function createChunksFromDocument(pageFile) {
  const pages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, pageFile), "utf8"));
  if (pages.length === 0) return [];

  const words = [];
  const wordPages = [];
  for (const page of pages) {
    for (const word of (page.text || "").split(/\s+/).filter(Boolean)) {
      words.push(word);
      wordPages.push(page.metadata.page);
    }
  }

  const { crop, source, document_type } = pages[0].metadata;
  const documentId = path.basename(pageFile, "_pages.json");
  const chunks = [];

  for (let start = 0; start < words.length; start += TARGET_WORDS - OVERLAP_WORDS) {
    const end = Math.min(start + TARGET_WORDS, words.length);
    chunks.push({
      id: `${documentId}_chunk_${chunks.length + 1}`,
      text: words.slice(start, end).join(" "),
      metadata: { crop, source, page: wordPages[start], document_type },
    });
    if (end >= words.length) break;
  }

  return chunks;
}

function main() {
  const pageFiles = getPageFiles();

  if (pageFiles.length === 0) {
    console.error("No *_pages.json files found.");
    process.exit(1);
  }

  console.log(`Found ${pageFiles.length} page document(s).`);

  const allChunks = [];
  for (const pageFile of pageFiles) {
    console.log(`Processing: ${pageFile}`);
    const chunks = createChunksFromDocument(pageFile);
    console.log(`Created ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allChunks, null, 2), "utf8");

  console.log("\n========== CHUNKING SUMMARY ==========");
  console.log(`Total chunks: ${allChunks.length}`);
  console.log(`Target chunk size: ${TARGET_WORDS} words`);
  console.log(`Overlap: ${OVERLAP_WORDS} words`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("=======================================");
}

main();
