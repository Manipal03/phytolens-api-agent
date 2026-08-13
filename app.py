import json
import os
import subprocess

import streamlit as st

st.set_page_config(page_title="PhytoLens AI — Farm Advisor", page_icon="🌱", layout="wide")

FARM = {"lat": 18.090829, "lon": 79.465273}
MODELS = ["llama3.2:latest", "qwen3.5:latest", "gemma3:1b"]
CHUNKS_FILE = "data/processed/tomato/tomato_chunks.json"

# 10 demo questions covering every tool and their combinations:
#   1  weather only · 2 satellite only · 3-4 docs only · 5-7 two tools · 8 all 4 tools · 9-10 multi-tool decisions
EXAMPLES = [
    # 1 — get_weather
    "What's the current weather at the farm?",
    # 2 — get_satellite_analysis
    "Is the vegetation at the farm healthy right now based on satellite data?",
    # 3 — search_knowledge_base
    "What does the tomato guide recommend for irrigation and water management?",
    # 4 — search_knowledge_base
    "What are the benefits of protected cultivation for tomatoes?",
    # 5 — get_weather + search_knowledge_base
    "What's the current weather at the farm, and what does the guide say about ideal conditions for tomato growth?",
    # 6 — get_satellite_analysis + search_knowledge_base
    "Based on satellite data, is the vegetation healthy, and what diseases should I watch for in tomatoes?",
    # 7 — get_soil_type + search_knowledge_base
    "What soil type does the farm have, and what does the guide say about ideal soil for tomatoes?",
    # 8 — ALL FOUR tools (showstopper)
    "Give me a full farm status report: current weather, soil type, satellite vegetation health, and the guide's advice on irrigation.",
    # 9 — get_weather + get_satellite_analysis + search_knowledge_base
    "Should I irrigate my tomatoes today? Consider the current weather, recent satellite vegetation health, and the guide's irrigation advice.",
    # 10 — get_weather + search_knowledge_base
    "Use the weather tool to check current conditions at the farm, and search the guide for planting guidance. Then tell me: is it a good time to plant tomatoes?",
]


def run_agent(question, model):
    env = dict(os.environ)
    env["OLLAMA_MODEL"] = model
    proc = subprocess.run(
        ["node", "query-agent.js", question],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=600,
    )
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        raise RuntimeError(stderr or f"Agent exited with code {proc.returncode}")
    return json.loads(proc.stdout), stderr


def render_tool_calls(tool_calls):
    with st.expander(f"🔧 Tool calls ({len(tool_calls)})", expanded=False):
        for call in tool_calls:
            icon = "✅" if call.get("ok") else "❌"
            with st.container(border=True):
                st.markdown(f"**{icon} `{call['name']}`**")
                st.code(json.dumps(call.get("args", {}), indent=2)[:1500])
                compact = call.get("compact")
                if compact is not None:
                    st.caption("Summary returned to the model:")
                    st.code(json.dumps(compact, indent=2)[:2000])
                else:
                    st.code(str(call.get("result", ""))[:1500])


def render_sources(sources):
    with st.expander(f"📚 Knowledge base sources ({len(sources)})", expanded=False):
        for src in sources:
            page = f" — p.{src.get('page')}" if src.get("page") else ""
            doc_type = f" · {src.get('document_type')}" if src.get("document_type") else ""
            with st.container(border=True):
                st.markdown(
                    f"**{src.get('source')}**{page}{doc_type} — score {float(src.get('score', 0)):.3f}"
                )
                st.write(src.get("text", "")[:600])


with st.sidebar:
    st.header("⚙️ Demo setup")
    st.caption(f"📍 Farm: lat {FARM['lat']}, lon {FARM['lon']}")
    model = st.selectbox(
        "LLM (Ollama)",
        MODELS,
        index=0,
        help="qwen3.5 needs ~5 GB free RAM; llama3.2 runs well on this laptop's GPU.",
    )
    try:
        chunks = json.load(open(CHUNKS_FILE, encoding="utf-8"))
        st.caption(f"📚 Knowledge base: {len(chunks)} chunks in Qdrant (`tomato_knowledge`)")
    except Exception:
        st.caption("📚 Knowledge base: chunks file not found")
    st.caption("Requires: Qdrant on port 6333 · Ollama on port 11434")

st.title("🌱 PhytoLens AI — Farm Advisor Demo")
st.caption(
    "The agent answers using **live APIs** (weather, soil, satellite) **and** the tomato "
    "knowledge base (ICAR guide + protected-cultivation research paper). "
    "Every answer shows the tool calls made and the doc chunks it grounded on."
)

with st.sidebar:
    with st.expander("🎯 Example questions (10)", expanded=True):
        for i, question in enumerate(EXAMPLES, start=1):
            if st.button(f"{i}. {question}", key=f"example_{i}", use_container_width=True):
                st.session_state.pending = question

if "messages" not in st.session_state:
    st.session_state.messages = []

prompt = st.session_state.pop("pending", None) or st.chat_input(
    "Ask about the farm, the weather, or tomato cultivation…"
)

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

if prompt:
    with st.chat_message("assistant"):
        with st.spinner("Calling tools and searching the knowledge base…"):
            try:
                result, stderr = run_agent(prompt, model)
            except Exception as exc:  # noqa: BLE001 — surface any agent failure to the user
                st.error(f"Agent failed: {exc}")
                result = None

        if result:
            if "error" in result:
                st.error(result["error"])
            else:
                st.write(result.get("answer", ""))
                if "[ragAgent]" in stderr:
                    st.caption(stderr.splitlines()[-1])
                tool_calls = result.get("toolCalls", [])
                sources = result.get("sources", [])
                if tool_calls:
                    render_tool_calls(tool_calls)
                if sources:
                    render_sources(sources)
                st.session_state.messages.append(
                    {"role": "assistant", "content": result.get("answer", "")}
                )
