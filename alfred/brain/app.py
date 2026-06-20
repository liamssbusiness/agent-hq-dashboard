"""Alfred Brain — always-on cloud service.

Run locally:
    pip install -r requirements.txt
    cp .env.example .env   # fill in OPENROUTER_API_KEY + ALFRED_ACCESS_TOKEN
    uvicorn app:app --host 0.0.0.0 --port 8080

Then open http://localhost:8080  (or your deployed URL) on any device.

Endpoints:
    GET  /            -> phone-friendly chat UI
    POST /chat        -> {"message": "...", "device": "phone"} -> {"reply": ...}
    GET  /budget      -> current spend vs. monthly budget
    GET  /health      -> liveness
"""
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

import connectors
import memory
import router
from persona import system_prompt

memory.init()

client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
)
ACCESS_TOKEN = os.getenv("ALFRED_ACCESS_TOKEN", "")
MAX_TOOL_HOPS = 4

app = FastAPI(title="Alfred Brain")
WEB_DIR = os.path.join(os.path.dirname(__file__), "web")


class ChatIn(BaseModel):
    message: str
    device: str = "unknown"
    force_strong: bool = False


def _auth(authorization: str | None):
    if not ACCESS_TOKEN:
        return  # token not set yet (local dev) -> allow
    if authorization != f"Bearer {ACCESS_TOKEN}":
        raise HTTPException(status_code=401, detail="Bad or missing access token.")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/budget")
def budget(authorization: str | None = Header(default=None)):
    _auth(authorization)
    return router.budget_status()


@app.post("/chat")
def chat(body: ChatIn, authorization: str | None = Header(default=None)):
    _auth(authorization)

    memory.log_message("user", body.message, body.device)
    model = router.choose_model(body.message, body.force_strong)

    recalled = memory.recall(body.message)
    messages = [{"role": "system", "content": system_prompt(recalled)}]
    messages += memory.recent(limit=12)

    used_models = [model]
    for _ in range(MAX_TOOL_HOPS):
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=connectors.TOOLS,
            tool_choice="auto",
        )
        if resp.usage:
            router.account(model, resp.usage)
        choice = resp.choices[0].message

        if not choice.tool_calls:
            reply = choice.content or ""
            memory.log_message("assistant", reply, body.device)
            return {"reply": reply, "model": model, "models_used": used_models,
                    "budget": router.budget_status()}

        # Execute tool calls, feed results back, loop.
        messages.append(choice.model_dump(exclude_none=True))
        for tc in choice.tool_calls:
            result = connectors.run_tool(tc.function.name, tc.function.arguments)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    # Ran out of tool hops — return whatever we have.
    fallback = "I worked through several tool steps but didn't reach a final answer. Ask me to continue."
    memory.log_message("assistant", fallback, body.device)
    return {"reply": fallback, "model": model, "models_used": used_models}


@app.get("/")
def home():
    index = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return {"alfred": "online", "ui": "missing web/index.html"}


if os.path.isdir(WEB_DIR):
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
