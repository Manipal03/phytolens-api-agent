import json
import os
import subprocess
import urllib.request

import streamlit as st

st.set_page_config(page_title="PhytoLens AI — Farm Advisor", page_icon="🌱", layout="wide")

FARMS_FILE = "data/farms.json"
MODELS = ["llama3.2:latest", "qwen3.5:latest", "gemma3:1b"]
CHUNKS_FILE = "data/processed/tomato/tomato_chunks.json"

# 10 demo questions covering every tool and their combinations:
EXAMPLES = [
    "What's the current weather at the farm?",
    "Is the vegetation at the farm healthy right now based on satellite data?",
    "What does the tomato guide recommend for irrigation and water management?",
    "What are the benefits of protected cultivation for tomatoes?",
    "What's the current weather at the farm, and what does the guide say about ideal conditions for tomato growth?",
    "Based on satellite data, is the vegetation healthy, and what diseases should I watch for in tomatoes?",
    "What soil type does the farm have, and what does the guide say about ideal soil for tomatoes?",
    "Give me a full farm status report: current weather, soil type, satellite vegetation health, and the guide's advice on irrigation.",
    "Should I irrigate my tomatoes today? Consider the current weather, recent satellite vegetation health, and the guide's irrigation advice.",
    "Using the tomato disease guide, what are the symptoms and control measures for early blight and late blight, and how do they spread?",
]


def load_farms():
    with open(FARMS_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_farms(store):
    with open(FARMS_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
        f.write("\n")


def service_up(port):
    try:
        with urllib.request.urlopen(f"http://localhost:{port}", timeout=2):
            return True
    except Exception:
        return False


def run_context(user_id, farm_id):
    env = dict(os.environ)
    env["PHYTOLENS_USER_ID"] = user_id
    env["PHYTOLENS_FARM_ID"] = farm_id
    proc = subprocess.run(
        ["node", "build-context.js"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=300,
    )
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        raise RuntimeError(stderr or "build-context.js failed")
    return json.loads(proc.stdout)


def run_agent(question, model, user_id, farm_id, live_context, history):
    env = dict(os.environ)
    env["OLLAMA_MODEL"] = model
    env["PHYTOLENS_USER_ID"] = user_id
    env["PHYTOLENS_FARM_ID"] = farm_id
    payload = {"question": question, "liveContext": live_context, "history": history}
    proc = subprocess.run(
        ["node", "query-agent.js"],
        input=json.dumps(payload),
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


# ------------------------- session state -------------------------
if "context_cache" not in st.session_state:
    st.session_state.context_cache = {}
if "conversations" not in st.session_state:
    st.session_state.conversations = {}
if "selected_user" not in st.session_state:
    st.session_state.selected_user = None
if "selected_farm" not in st.session_state:
    st.session_state.selected_farm = None

# ------------------------- sidebar -------------------------
with st.sidebar:
    st.header("⚙️ Demo setup")
    store = load_farms()
    users = store["users"]

    user_names = [u["name"] for u in users]
    user_idx = st.selectbox(
        "👤 User",
        range(len(users)),
        format_func=lambda i: user_names[i],
        key="user_select",
    )
    st.session_state.selected_user = users[user_idx]["id"]

    farms = users[user_idx]["farms"]
    if not farms:
        st.warning("This user has no farms yet — register one below.")
        st.session_state.selected_farm = None
    else:
        farm_names = [f"{f['name']} (lat {f['lat']}, lon {f['lon']})" for f in farms]
        farm_idx = st.selectbox(
            "🌾 Farm",
            range(len(farms)),
            format_func=lambda i: farm_names[i],
            key="farm_select",
        )
        st.session_state.selected_farm = farms[farm_idx]["id"]
        farm = farms[farm_idx]
        st.caption(f"📍 GPS: lat {farm['lat']}, lon {farm['lon']} · {farm.get('crop', 'tomato')} · {farm.get('area_acres', '?')} acres")

    # ---- register farm ----
    with st.expander("➕ Register Farm"):
        with st.form("register_farm"):
            r_name = st.text_input("Farm name", placeholder="e.g. my farm 2 tomato")
            r_crop = st.text_input("Crop", value="tomato")
            r_lat = st.number_input("Latitude", value=18.090829, format="%.6f")
            r_lon = st.number_input("Longitude", value=79.465273, format="%.6f")
            r_area = st.number_input("Area (acres)", value=1.0, min_value=0.1, format="%.1f")
            submitted = st.form_submit_button("Save farm")
            if submitted:
                new_farm = {
                    "id": f"farm-{len(farms) + 1}",
                    "name": r_name or f"Farm {len(farms) + 1}",
                    "crop": r_crop or "tomato",
                    "area_acres": r_area,
                    "lat": r_lat,
                    "lon": r_lon,
                }
                users[user_idx]["farms"].append(new_farm)
                save_farms(store)
                st.session_state.selected_farm = new_farm["id"]
                st.success(f"Registered '{new_farm['name']}' at lat {r_lat}, lon {r_lon}")
                st.rerun()

    # ---- live context (cached per user+farm) ----
    if st.session_state.selected_farm:
        ctx_key = (st.session_state.selected_user, st.session_state.selected_farm)
        if ctx_key not in st.session_state.context_cache:
            with st.spinner("Fetching live context (weather, soil, NDVI)…"):
                try:
                    st.session_state.context_cache[ctx_key] = run_context(*ctx_key)
                except Exception as exc:  # noqa: BLE001
                    st.session_state.context_cache[ctx_key] = {"error": str(exc)}

        cached = st.session_state.context_cache[ctx_key]
        with st.expander("🌤 Live farm context (auto-injected)", expanded=True):
            if "error" in cached:
                st.error(f"Could not fetch live context: {cached['error']}")
            else:
                st.caption(f"Fetched {cached['fetchedAt']}")
                st.code(cached["context"], language="text")
            if st.button("🔄 Refresh context", use_container_width=True):
                try:
                    st.session_state.context_cache[ctx_key] = run_context(*ctx_key)
                    st.rerun()
                except Exception as exc:  # noqa: BLE001
                    st.error(f"Refresh failed: {exc}")

    st.divider()
    qdrant_ok = service_up(6333)
    ollama_ok = service_up(11434)
    st.caption("🟢 Qdrant :6333" if qdrant_ok else "🔴 Qdrant :6333 — knowledge search will fail")
    st.caption("🟢 Ollama :11434" if ollama_ok else "🔴 Ollama :11434 — app won't work")

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

    with st.expander("🎯 Example questions", expanded=False):
        for i, question in enumerate(EXAMPLES, start=1):
            if st.button(f"{i}. {question}", key=f"example_{i}", use_container_width=True):
                st.session_state.pending = question

# ------------------------- main -------------------------
st.title("🌱 PhytoLens AI — Farm Advisor")
st.caption(
    "Each user and farm has its own **GPS context**, **pre-fetched live conditions** "
    "(weather, soil, NDVI average) and **conversation memory**. The agent answers using "
    "live APIs **and** the tomato knowledge base (ICAR guide + protected cultivation + diseases guide)."
)

selected = (st.session_state.selected_user, st.session_state.selected_farm)
if selected[1] is None:
    st.info("Register a farm first — use the sidebar form.")
    st.stop()

conv_key = selected
if conv_key not in st.session_state.conversations:
    st.session_state.conversations[conv_key] = []

messages = st.session_state.conversations[conv_key]

for message in messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

prompt = st.session_state.pop("pending", None) or st.chat_input(
    "Ask about this farm, the weather, or tomato cultivation…"
)

if prompt:
    messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.write(prompt)

    live_context = None
    cached = st.session_state.context_cache.get(conv_key)
    if cached and "context" in cached:
        live_context = cached["context"]

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in messages[:-1]
        if m["role"] in ("user", "assistant")
    ]

    with st.chat_message("assistant"):
        with st.spinner("Calling tools and searching the knowledge base…"):
            try:
                result, stderr = run_agent(prompt, model, conv_key[0], conv_key[1], live_context, history)
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
                messages.append({"role": "assistant", "content": result.get("answer", "")})
