# PhytoLens API Agent — Multi-Farm RAG + Tool-Calling Demo

An Ollama-powered farm-advisory agent that answers tomato-farming questions by
**combining live API data** (weather, soil, satellite/NDVI) **with a knowledge base**
of tomato documents (ICAR cultivation guide, protected-cultivation research paper,
and a tomato diseases guide) retrieved from a vector database.

Each **user** owns one or more **farms**, and each farm has its own **GPS
coordinates**. The agent's system prompt is built from the selected farm's
context (GPS, crop, area) **plus pre-fetched live conditions** — weather, soil,
and the NDVI average — so the model already "knows" the farm's current state on
the first message.

## Architecture

```
data/farms.json                 users → farms (GPS, crop, area, GeoJSON boundary)
        │  src/farms/farmStore.js  (getUsers / getFarms / getFarm / registerFarm)
        ▼
build-context.js  ── fetchFarmContext() ── getWeather + getSoilType + getSatelliteAnalysis
        │              (parallel; each source degrades gracefully)
        ▼
  farm context block ── injected into buildSystemPrompt(farm, liveContext)
        │
data/documents/tomato/*.pdf
        │  npm run ingest      (pdfLoader.js → per-page JSON → chunker.js)
        ▼
data/processed/tomato/tomato_chunks.json   (500-word chunks, 80-word overlap)
        │  npm run index       (embed via Ollama nomic-embed-text → Qdrant)
        ▼
Qdrant collection "tomato_knowledge" (768-dim vectors)
        ▲
        │  search_knowledge_base tool (retriever.js: embed query → Qdrant search)
        │
  agent.js / src/rag/ragAgent.js  ── Ollama chat loop with 4 tools:
        │      get_weather            → Open-Meteo (no key)
        │      get_soil_type          → ISRIC SoilGrids (no key; texture class + pH + SOC)
        │      get_satellite_analysis → PhytoLens backend, falls back to NASA MODIS (no key)
        │      search_knowledge_base  → Qdrant retrieval
        ▼
  app.py  (Streamlit chat demo: user + farm selectors, register farm, live-context panel)
```

The agent loop lives in `src/rag/ragAgent.js` and returns `{ answer, toolCalls,
sources }`, so the CLI (`agent.js`), the JSON bridge (`query-agent.js`), and the
tests all share one code path.

### Satellite fallback chain

`get_satellite_analysis` tries, in order:

1. PhytoLens remote-sensing backend **with** `REMOTE_SENSING_API_KEY` (if set);
2. the same backend **without** the key (the live service currently needs none);
3. **NASA MODIS MOD13Q1** (16-day NDVI, 250 m) via the ORNL DAAC REST service —
   open data, no key. Returns NDVI at the farm's centroid.

The result is compacted to per-source observation counts and index averages
(NDVI, EVI, NDRE, …) before it reaches the model, so small models stay grounded
without overflowing context.

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

```bash
npm run ingest     # extract + chunk the PDFs (writes data/processed/tomato/)
npm run index      # embed chunks and upsert into Qdrant (drops + rebuilds the collection)
```

`data/documents/tomato/` ships three guides: ICAR production guide, protected
cultivation research paper, and **tomato diseases** (Ohio State / Sokoine
University). Any new PDF dropped in that folder is picked up by `npm run ingest`.

## Run

CLI (picks the first seeded user's first farm, pre-fetches live context):
```bash
node agent.js "What's the current weather and soil type at this farm?"
node agent.js --user user-2 --farm farm-3 "Should I irrigate today?"
```

Streamlit demo — multi-user, multi-farm, per-farm live context + chat memory:
```bash
npm run demo        # then open http://localhost:8501
```
In the sidebar: pick a **user** and a **farm** (each shows its GPS), register
new farms, and watch the **live context** (weather, soil, NDVI) get auto-fetched
once per farm and cached for the session (refresh button included). Each
(user, farm) pair keeps its own conversation history, and that history plus the
farm context is sent to the agent on every message.

Test the agent on hybrid API + docs questions:
```bash
npm test            # tests/hybrid-agent-test.js — 5 questions (needs services)
node tests/farm-context-test.js   # offline unit tests for the farm store + prompt builder
```

## Model notes

- The model is set via `OLLAMA_MODEL` in `.env`. `qwen3.5:latest` gives the best
  answers but needs ~5 GB free RAM.
- If the configured model can't load due to memory, `ragAgent.js` automatically
  falls back to `OLLAMA_FALLBACK_MODEL` (`llama3.2:latest` by default).
- The satellite tool returns ~20k chars of index series; the agent compacts it
  to per-source averages before sending it to the model.

## Known issues

- **OpenLandMap dropped its USDA great-group point layer** (their `/query/point`
  API now returns `{"error":"The corresponding files could not be found..."}` for
  every `coll`/`regex` combo). The soil tool uses **ISRIC SoilGrids v2.0**
  (`rest.isric.org`, open data, no key) instead: sand/silt/clay %, USDA texture
  class, pH and organic carbon for the topsoil. SoilGrids can be slow under
  load, so the tool retries 5xx/429/timeouts up to 3 times.
- Vector store requires Qdrant running on `localhost:6333` (see `requests.http`
  for the probe history, `notes-aug11-phytolens.md` for the debugging log).
- The knowledge base is tomato-only; non-tomato crops can be registered but the
  doc search will still return tomato guidance.
