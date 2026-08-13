# Notes — PhytoLens AI Demo (Aug 11, 2026)

## Goal today
Build a working demo: an Ollama/Gemma-powered agent that can call the three
real external APIs (weather, soil, satellite) my manager gave me, and answer
farm questions grounded in that live data.

## What I built
`phytolens-api-agent` — a Node.js tool-calling agent:
- LLM: Gemma, running locally via Ollama (no OpenAI, no cloud LLM)
- 3 tools: `get_weather`, `get_soil_type`, `get_satellite_analysis`
- The model decides which tool(s) to call based on the question, calls the
  real API, then answers using the returned data

## Stack confirmed
- Weather: Open-Meteo — free, no API key, working
- Satellite: PhytoLens's own remote-sensing backend — working
- Soil: OpenLandMap — still debugging (see below)
- LLM: switched from `gemma4:e4b` (9.6GB, too much RAM for my laptop) to
  `qwen3.5:latest` (6.6GB, already installed) — works, reliable tool calling

## Bugs found and fixed today
1. **Wrong Ollama model tag** — tried `gemma4:9b`, doesn't exist. Correct
   tags are `e2b`, `e4b`, `12b`, `26b`, `31b`.
2. **Satellite endpoint was wrong** — the API contract PDF said
   `/api/v1/analysis/all`, but that's outdated. Found the real route
   (`/analyze-all`, no `/api/v1` prefix) by checking the service's live
   `/openapi.json` — this also showed **no auth/API key is actually required**
   right now, which explained why the teammate's answer about a key was unclear.
3. **Soil endpoint was wrong** — teammate's snippet used
   `/query/soil/taxousda`, which doesn't exist. Real OpenLandMap endpoint is
   `/query/point?...&regex=<filename pattern>`.
4. **Satellite tool wasn't being called at all** in combined queries — the
   date range was marked "required" in the tool schema, so the model just
   asked the user for dates instead of calling the tool. Fixed by making
   dates optional and auto-defaulting to "last 6 months" in code.

## Still open / continue tomorrow
- **Soil API**: getting `{"error":"The corresponding files could not be
  found. Please verify coll or regex parameter."}` — the exact filename
  pattern from OpenLandMap's docs (`sol_grtgroup_usda.soiltax_c_250m_...`)
  seems to have changed on their end. Last thing I tried: broadening the
  regex to just `grtgroup` instead of the full old filename, since `regex`
  is a pattern match, not an exact name — need to confirm if that worked.
- If soil still doesn't resolve, fallback options: try `/docs` (Swagger UI)
  on `api.openlandmap.org` directly in browser to find current valid
  filenames, or ask teammate if they have a known-working soil query.

## Key learning to explain tomorrow
Both third-party integration docs I was given (remote-sensing PDF and the
soil API snippet) were **outdated** — the actual live services had moved on
from what was documented. The fix each time was the same: check the live
service's own `/openapi.json` (or Swagger `/docs`) to get ground truth
instead of trusting the doc. Worth flagging to the team that these docs need
updating.

## Demo status
Weather + satellite: fully working end-to-end, grounded answers with real
data. Soil: blocked on the API-side issue above, otherwise wired up
identically. Good enough to show as a live progress demo tomorrow even with
soil pending.
