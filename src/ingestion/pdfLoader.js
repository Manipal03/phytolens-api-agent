import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENTS_DIR = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "documents",
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

function getDocumentType(fileName) {
  const name = fileName.toLowerCase();

  if (name.includes("disease")) {
    return "disease_guide";
  }

  if (name.includes("protected")) {
    return "research_paper";
  }

  return "production_guide";
}

async function extractPdf(fileName) {
  const inputPath = path.join(DOCUMENTS_DIR, fileName);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`PDF not found: ${inputPath}`);
  }

  const buffer = fs.readFileSync(inputPath);

  console.log(`\nProcessing: ${fileName}`);
  console.log(
    `File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`
  );

  const parser = new PDFParse({
    data: buffer
  });

  const result = await parser.getText();

  console.log(`Pages detected: ${result.total}`);

  /*
   * pdf-parse v2 returns the complete extracted text.
   * We keep the complete text here and additionally create
   * page-level records when page information is available.
   */

  const fullText = cleanText(result.text || "");

  const documentType = getDocumentType(fileName);

  const documentId = path.basename(
    fileName,
    path.extname(fileName)
  );

  const document = {
    document_id: documentId,
    crop: "tomato",
    source: fileName,
    document_type: documentType,
    total_pages: result.total,
    text: fullText
  };

  /*
   * Save the complete document representation.
   */

  const documentsPath = path.join(
    OUTPUT_DIR,
    `${documentId}.json`
  );

  fs.writeFileSync(
    documentsPath,
    JSON.stringify(document, null, 2),
    "utf8"
  );

  /*
   * Create a basic page-aware structure.
   *
   * If page-level text is exposed by the parser, use it.
   * Otherwise keep the complete document as a single record
   * and do NOT fabricate page numbers.
   */

  const pages = [];

  if (Array.isArray(result.pages) && result.pages.length > 0) {
    for (let i = 0; i < result.pages.length; i++) {
      const page = result.pages[i];

      const pageText = cleanText(
        typeof page === "string"
          ? page
          : page.text || ""
      );

      if (!pageText) continue;

      pages.push({
        id: `${documentId}_page_${i + 1}`,
        text: pageText,
        metadata: {
          crop: "tomato",
          source: fileName,
          page: i + 1,
          document_type: documentType
        }
      });
    }
  }

  /*
   * If the parser does not expose page objects,
   * retain the full document without inventing page numbers.
   */

  if (pages.length === 0 && fullText.length > 0) {
    pages.push({
      id: `${documentId}_document`,
      text: fullText,
      metadata: {
        crop: "tomato",
        source: fileName,
        page: null,
        document_type: documentType
      }
    });

    console.log(
      "Page-level text was not exposed by the parser; preserving full document without fabricated page numbers."
    );
  }

  const pagesPath = path.join(
    OUTPUT_DIR,
    `${documentId}_pages.json`
  );

  fs.writeFileSync(
    pagesPath,
    JSON.stringify(pages, null, 2),
    "utf8"
  );

  console.log(`Characters extracted: ${fullText.length}`);
  console.log(`Page/document records: ${pages.length}`);
  console.log(`Document JSON: ${documentsPath}`);
  console.log(`Pages JSON: ${pagesPath}`);

  await parser.destroy();

  return {
    fileName,
    pages: result.total,
    characters: fullText.length,
    pageRecords: pages.length
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  });

  const pdfFiles = fs
    .readdirSync(DOCUMENTS_DIR)
    .filter((file) =>
      file.toLowerCase().endsWith(".pdf")
    );

  if (pdfFiles.length === 0) {
    console.error("No PDF files found.");
    process.exit(1);
  }

  console.log(
    `Found ${pdfFiles.length} PDF file(s).`
  );

  const results = [];

  for (const file of pdfFiles) {
    try {
      const result = await extractPdf(file);
      results.push(result);
    } catch (error) {
      console.error(
        `\nFailed to process: ${file}`
      );
      console.error(error);
    }
  }

  console.log(
    "\n========== EXTRACTION SUMMARY =========="
  );

  for (const result of results) {
    console.log(
      `${result.fileName} → ` +
      `${result.pages} pages → ` +
      `${result.characters} characters → ` +
      `${result.pageRecords} records`
    );
  }

  console.log(
    "========================================"
  );
}

main().catch((error) => {
  console.error(
    "\nExtraction failed:"
  );
  console.error(error);
  process.exit(1);
});