import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from agent_manager import AgentManager
from config import CDP_URL, WS_HOST, WS_PORT
from ws_handler import WebSocketHandler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

agent_manager: AgentManager
ws_handler: WebSocketHandler


@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_manager, ws_handler
    agent_manager = AgentManager(cdp_url=CDP_URL)
    ws_handler = WebSocketHandler(agent_manager)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=WS_HOST, port=WS_PORT, reload=True)
