import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from agent_manager import AgentManager
from cdp_proxy import CdpProxyManager
from config import CDP_URL, WS_HOST, WS_PORT
from ws_handler import WebSocketHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

agent_manager: AgentManager
ws_handler: WebSocketHandler
cdp_proxy: CdpProxyManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_manager, ws_handler, cdp_proxy
    cdp_proxy = CdpProxyManager()
    agent_manager = AgentManager(cdp_url=CDP_URL, cdp_proxy=cdp_proxy)
    ws_handler = WebSocketHandler(agent_manager, cdp_proxy)
    logger.info(f"AgentManager initialized, CDP URL: {CDP_URL}")
    yield
    await agent_manager.shutdown()
    logger.info("AgentManager shut down")


app = FastAPI(title="Medical Planning Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_handler.handle_connection(websocket)


@app.get("/health")
async def health_check():
    cdp_available = await agent_manager.check_cdp() if agent_manager else False
    return {
        "status": "ok",
        "cdp_available": cdp_available,
        "cdp_url": CDP_URL,
    }


# ---- CDP Proxy HTTP endpoints (browser-use/Playwright connects here) ----

@app.get("/json/version")
async def cdp_version():
    return cdp_proxy.get_version()


@app.get("/json")
async def cdp_list_targets():
    return cdp_proxy.get_targets()


@app.get("/json/new")
async def cdp_new_tab():
    return {"id": "pending", "type": "page"}


# ---- CDP Proxy WebSocket endpoints ----

@app.websocket("/devtools/page/{target_id}")
async def cdp_page_devtools(websocket: WebSocket, target_id: str):
    await cdp_proxy.handle_page_ws(websocket, target_id)


@app.websocket("/cdp-bridge")
async def cdp_bridge_endpoint(websocket: WebSocket):
    session_id = websocket.query_params.get("session_id", "")
    await cdp_proxy.handle_bridge_ws(websocket, session_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=WS_HOST, port=WS_PORT, reload=True)
