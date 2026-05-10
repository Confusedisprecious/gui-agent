import json
import logging

from fastapi import WebSocket

from agent_manager import AgentManager
from llm_factory import create_llm
from models import AgentConfig

logger = logging.getLogger(__name__)


class WebSocketHandler:
    def __init__(self, agent_manager: AgentManager):
        self.agent_manager = agent_manager
        self.connections: dict[str, WebSocket] = {}

    async def handle_connection(self, websocket: WebSocket):
        await websocket.accept()
        session_id = str(id(websocket))
        self.connections[session_id] = websocket

        async def send_callback(data: dict):
            try:
                await websocket.send_json(data)
            except Exception:
                pass

        await websocket.send_json({
            "type": "connection_ready",
            "session_id": session_id,
        })

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "error": "Invalid JSON",
                    })
                    continue

                msg_type = msg.get("type", "")
                await self._dispatch(session_id, msg_type, msg, send_callback, websocket)
        except Exception as e:
            logger.info(f"WebSocket disconnected: {session_id} - {e}")
        finally:
            self.connections.pop(session_id, None)
            await self.agent_manager.stop_agent(session_id)

    async def _dispatch(
        self,
        session_id: str,
        msg_type: str,
        msg: dict,
        send_callback,
        websocket: WebSocket,
    ):
        if msg_type == "ping":
            await websocket.send_json({"type": "pong"})

        elif msg_type == "chat_message":
            await self._handle_chat(session_id, msg, send_callback)

        elif msg_type == "execute_task":
            await self._handle_execute_task(session_id, msg, send_callback)

        elif msg_type == "stop_task":
            await self.agent_manager.stop_agent(session_id)
            await send_callback({"type": "status_change", "session_id": session_id, "status": "stopped"})

        elif msg_type == "check_cdp":
            cdp_available = await self.agent_manager.check_cdp()
            await send_callback({"type": "cdp_status", "available": cdp_available})

        else:
            await send_callback({"type": "error", "error": f"Unknown message type: {msg_type}"})

    async def _handle_chat(self, session_id: str, msg: dict, send_callback):
        message = msg.get("message", "")
        config_dict = msg.get("config", {})

        llm = create_llm(
            model=config_dict.get("model", "deepseek-v4-flash"),
            api_key=config_dict.get("api_key", ""),
            base_url=config_dict.get("base_url", "https://api.deepseek.com/v1"),
        )

        from browser_use.llm.messages import UserMessage

        try:
            response = await llm.ainvoke(
                messages=[UserMessage(content=message)],
                output_format=None,
            )
            await send_callback({
                "type": "chat_response",
                "session_id": session_id,
                "message": response.completion if hasattr(response, 'completion') else str(response),
            })
        except Exception as e:
            logger.error(f"Chat error: {e}")
            await send_callback({
                "type": "chat_error",
                "session_id": session_id,
                "error": str(e),
            })

    async def _handle_execute_task(self, session_id: str, msg: dict, send_callback):
        config_dict = msg.get("config", {})
        config = AgentConfig(
            task=config_dict.get("task", ""),
            api_key=config_dict.get("api_key", ""),
            model=config_dict.get("model", "deepseek-v4-flash"),
            base_url=config_dict.get("base_url", "https://api.deepseek.com/v1"),
            max_steps=config_dict.get("max_steps", 50),
            use_vision=config_dict.get("use_vision", False),
            skills=config_dict.get("skills", []),
        )

        llm = create_llm(
            model=config.model,
            api_key=config.api_key,
            base_url=config.base_url,
        )

        await send_callback({"type": "status_change", "session_id": session_id, "status": "starting"})

        try:
            await self.agent_manager.create_agent(session_id, config, llm, send_callback)
            await send_callback({"type": "status_change", "session_id": session_id, "status": "running"})

            import asyncio
            asyncio.create_task(self.agent_manager.run_agent(session_id))
        except Exception as e:
            logger.error(f"Execute task error: {e}")
            await send_callback({
                "type": "agent_error",
                "session_id": session_id,
                "error": str(e),
            })
