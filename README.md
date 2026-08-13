# PhytoLens API Agent — Tool-Calling + RAG Demo

An Ollama-powered farm-advisory agent that answers tomato-farming questions by
**combining live API data** (weather, soil, satellite) **with a knowledge base**
of tomato documents (ICAR cultivation guide + protected-cultivation research
paper) retrieved from a vector database.

## Architecture

```
data/documents/tomato/*.pdf
        │  npm run ingest        (pdfLoader.js → per-page JSON → chunker.js)
        ▼
data/processed/tomato/tomato_chunks.json   (500-word chunks, 80-word overlap)
        │  npm run index         (embed via Ollama nomic-embed-text → Qdrant)
        ▼
Qdrant collection "tomato_knowledge" (768-dim vectors)
        ▲
        │  search_knowledge_base tool (retriever.js: embed query → Qdrant search)
        │
  agent.js / src/rag/ragAgent.js  ── Ollama chat loop with 4 tools:
        │      get_weather            → Open-Meteo (no key)
        │      get_soil_type          → OpenLandMap (⚠ still broken upstream)
        │      get_satellite_analysis → PhytoLens remote-sensing backend
        │      search_knowledge_base  → Qdrant retrieval
        ▼
  app.py  (Streamlit chat demo: answer + tool-call trace + doc sources)
```

The agent loop lives in `src/rag/ragAgent.js` and returns `{ answer, toolCalls,
sources }`, so the CLI (`agent.js`), the JSON bridge for Streamlit
(`query-agent.js`), and tests all share one code path.

## Setup

1. Install dependencies:
   ```
   npm install
   pip install streamlit      # only needed for the demo UI
   ```
2. Pull Ollama models:
   ```
   ollama pull qwen3.5:latest      # chat model (needs ~5 GB free RAM)
   ollama pull llama3.2:latest     # lighter fallback, fits on a 4 GB GPU
   ollama pull nomic-embed-text    # embeddings (768-dim)
   ```
3. Start the services:
   ```
   ollama serve
   docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
   ```
4. Copy `.env.example` to `.env` and fill in `REMOTE_SENSING_BASE_URL`.

## Index the knowledge base

```
npm run ingest     # extract + chunk the PDFs (writes data/processed/tomato/)
npm run index      # embed chunks and upsert into Qdrant
```

## Run

CLI:
```
node agent.js "What's the current weather and soil type at this farm?"
node agent.js "What does the tomato guide recommend for irrigation?"
```

Streamlit demo (chat with tool calls + sources):
```
npm run demo        # then open http://localhost:8501
```

Test the agent on hybrid API + docs questions:
```
npm test            # tests/hybrid-agent-test.js — 5 questions
```

## Model notes

- The model is set via `OLLAMA_MODEL` in `.env`. `qwen3.5:latest` gives the best
  answers but needs ~5 GB free RAM.
- If the configured model can't load due to memory, `ragAgent.js` automatically
  falls back to `OLLAMA_FALLBACK_MODEL` (`llama3.2:latest` by default).
- The satellite tool returns ~20k chars of index series; the agent compacts it
  to per-source averages before sending it to the model, so small models stay
  grounded without overflowing context.

## Known issues

- **Soil API (OpenLandMap)** is still failing upstream
  (`{"error":"The corresponding files could not be found..."}`). The agent
  detects the failure and answers from the knowledge base instead. Check
  `api.openlandmap.org/docs` for current valid `coll`/`regex` values.
- Vector store requires Qdrant running on `localhost:6333` (see `requests.http`
  for the probe history, `notes-aug11-phytolens.md` for the debugging log).
