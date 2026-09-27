# 🌱 PhytoLens API Agent — Multi-Farm RAG + Tool-Calling Demo

An Ollama-powered farm-advisory agent that answers tomato-farming questions by combining:

- 🌦️ **Live API data** — weather, soil, satellite/NDVI
- 📚 **Knowledge-base retrieval** — tomato-farming documents stored in a vector database
- 🛠️ **Tool calling** — dynamically retrieves live farm data and relevant documents
- 🏡 **Multi-farm context** — each user can own multiple farms with their own GPS coordinates

The knowledge base currently includes:

- ICAR tomato cultivation guide
- Protected-cultivation research paper
- Tomato diseases guide

---

## 🏗️ Architecture

```text
data/farms.json
        │
        │ users → farms (GPS, crop, area, GeoJSON boundary)
        ▼
src/farms/farmStore.js
        │
        │ getUsers / getFarms / getFarm / registerFarm
        ▼
build-context.js
        │
        │ fetchFarmContext()
        ├── getWeather
        ├── getSoilType
        └── getSatelliteAnalysis
        │
        │ Parallel requests with graceful degradation
        ▼
Farm Context
        │
        │ GPS + crop + area + live conditions
        ▼
buildSystemPrompt(farm, liveContext)
        │
        ├──────────────────────────────────────┐
        │                                      │
        ▼                                      ▼
data/documents/tomato/*.pdf              Agent / RAG Pipeline
        │                                      │
        │ npm run ingest                       │
        ▼                                      │
pdfLoader.js                                │
        │                                      │
        ▼                                      │
chunker.js                                  │
        │                                      │
        │ 500-word chunks                    │
        │ 80-word overlap                    │
        ▼                                      │
data/processed/tomato/tomato_chunks.json    │
        │                                      │
        │ npm run index                        │
        ▼                                      │
Ollama: nomic-embed-text                     │
        │                                      │
        ▼                                      │
Qdrant                                       │
        │                                      │
        │ Collection: tomato_knowledge       │
        │ 768-dimensional vectors            │
        │                                      │
        └───────────────┬──────────────────────┘
                        │
                        ▼
              search_knowledge_base
                        │
                        ▼
          src/retrieval/retriever.js
                        │
                        ▼
                  Qdrant Search
                        │
                        ▼
                src/rag/ragAgent.js
                        │
                        │ Ollama chat loop
                        │
                        ├── get_weather
                        │     └── Open-Meteo
                        │
                        ├── get_soil_type
                        │     └── ISRIC SoilGrids
                        │
                        ├── get_satellite_analysis
                        │     └── PhytoLens / NASA MODIS
                        │
                        └── search_knowledge_base
                              └── Qdrant
                        │
                        ▼
                      app.py
                        │
                        ▼
              Streamlit Chat Demo
