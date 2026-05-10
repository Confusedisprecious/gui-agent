import asyncio
import json
import logging
import uuid

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class CdpProxyManager:
    """Proxies CDP between Playwright (browser-use) and the Chrome extension's chrome.debugger.

    Playwright connects to /devtools/page/{id} thinking it's a real Chrome CDP.
    The extension connects to /cdp-bridge?session_id={id} as the other side.
    This manager pairs them and forwards CDP messages bidirectionally.
    """

    def __init__(self):
        self.session_lock = asyncio.Lock()
        # session_id -> {page_ws, bridge_ws, bridge_ready_event, tab_id}
        self.sessions: dict[str, dict] = {}

    async def register(self, session_id: str) -> None:
        async with self.session_lock:
            self.sessions[session_id] = {
                "page_ws": None,
                "bridge_ws": None,
                "bridge_ready": asyncio.Event(),
                "tab_id": None,
            }
        logger.info(f"[CDP Proxy] Registered session {session_id}")

    async def set_tab_id(self, session_id: str, tab_id: int) -> None:
        async with self.session_lock:
            if session_id in self.sessions:
                self.sessions[session_id]["tab_id"] = tab_id

    # ---- HTTP endpoints (faked CDP browser info) ----

    def get_version(self) -> dict:
        return {
            "Browser": "Chrome/Proxy",
            "Protocol-Version": "1.3",
            "User-Agent": "Chrome",
            "V8-Version": "1.0",
            "WebKit-Version": "1.0",
            "webSocketDebuggerUrl": "",
        }

    def get_targets(self) -> list[dict]:
        # Return all active session IDs as CDP targets
        targets = []
        for sid, s in self.sessions.items():
            if s["page_ws"] or s["bridge_ws"]:
                targets.append({
                    "id": sid,
                    "type": "page",
                    "title": "",
                    "url": "about:blank",
                    "webSocketDebuggerUrl": f"ws://127.0.0.1:8765/devtools/page/{sid}",
                    "attached": s["page_ws"] is not None,
                })
        # If no sessions exist yet, return a placeholder so Playwright can proceed
        if not targets:
            placeholder_id = "pending"
            targets.append({
                "id": placeholder_id,
                "type": "page",
                "title": "",
                "url": "about:blank",
                "webSocketDebuggerUrl": f"ws://127.0.0.1:8765/devtools/page/{placeholder_id}",
                "attached": False,
            })
        return targets

    def find_session_for_target(self, target_id: str) -> str | None:
        """Map a CDP target ID back to a proxy session ID."""
        if target_id == "pending":
            # Return the first session that's waiting for a page connection
            for sid, s in self.sessions.items():
                if s["page_ws"] is None:
                    return sid
        if target_id in self.sessions:
            return target_id
        return None

    # ---- Page DevTools WebSocket (Playwright connects here) ----

    async def handle_page_ws(self, websocket: WebSocket, raw_target_id: str):
        target_id = raw_target_id
        session_id = self.find_session_for_target(target_id)

        if not session_id:
            logger.warning(f"[CDP Proxy] No session for target {target_id}, closing")
            await websocket.accept()
            await websocket.close()
            return

        await websocket.accept()
        logger.info(f"[CDP Proxy] Playwright connected on page WS for {session_id}")

        session = self.sessions.get(session_id)
        if not session:
            await websocket.close()
            return

        session["page_ws"] = websocket

        try:
            while True:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=300)
                data = json.loads(raw)

                method = data.get("method")
                if method:
                    msg_id = data.get("id")
                    params = data.get("params", {})

                    bridge = session.get("bridge_ws")
                    if not bridge:
                        await websocket.send_json({
                            "id": msg_id,
                            "error": {"code": -32000, "message": "Bridge not connected"},
                        })
                        continue

                    await bridge.send_json({
                        "type": "cdp_command",
                        "msgId": msg_id,
                        "method": method,
                        "params": params,
                    })
        except asyncio.TimeoutError:
            logger.info(f"[CDP Proxy] Page WS timeout for {session_id}")
        except Exception as e:
            logger.info(f"[CDP Proxy] Page WS closed for {session_id}: {e}")
        finally:
            await self._cleanup(session_id)

    # ---- Bridge WebSocket (Extension connects here) ----

    async def handle_bridge_ws(self, websocket: WebSocket, session_id: str):
        if not session_id or session_id not in self.sessions:
            await websocket.accept()
            await websocket.send_json({"type": "error", "error": "Unknown session"})
            await websocket.close()
            return

        await websocket.accept()
        logger.info(f"[CDP Proxy] Extension bridge connected for {session_id}")

        session = self.sessions[session_id]
        session["bridge_ws"] = websocket
        session["bridge_ready"].set()

        try:
            while True:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=300)
                data = json.loads(raw)

                t = data.get("type", "")
                page_ws = session.get("page_ws")

                if not page_ws:
                    continue

                if t == "cdp_response":
                    await page_ws.send_json({
                        "id": data["msgId"],
                        "result": data.get("result", {}),
                    })
                elif t == "cdp_error":
                    await page_ws.send_json({
                        "id": data["msgId"],
                        "error": data.get("error", {"code": -32000, "message": "CDP error"}),
                    })
                elif t == "cdp_event":
                    await page_ws.send_json({
                        "method": data["method"],
                        "params": data.get("params", {}),
                    })
        except asyncio.TimeoutError:
            logger.info(f"[CDP Proxy] Bridge timeout for {session_id}")
        except Exception as e:
            logger.info(f"[CDP Proxy] Bridge closed for {session_id}: {e}")
        finally:
            await self._cleanup(session_id)

    async def _cleanup(self, session_id: str):
        async with self.session_lock:
            session = self.sessions.pop(session_id, None)
        if not session:
            return
        logger.info(f"[CDP Proxy] Cleaning up session {session_id}")
        for key in ("page_ws", "bridge_ws"):
            ws = session.get(key)
            if ws:
                try:
                    await ws.close()
                except Exception:
                    pass
