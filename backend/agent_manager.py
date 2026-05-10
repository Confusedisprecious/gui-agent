import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import httpx
from browser_use import Agent, BrowserProfile, BrowserSession
from browser_use.agent.views import AgentHistoryList, AgentOutput
from browser_use.browser.views import BrowserStateSummary
from browser_use.llm.base import BaseChatModel

from models import AgentConfig

logger = logging.getLogger(__name__)


@dataclass
class Session:
    agent: Agent | None = None
    browser_session: BrowserSession | None = None
    config: AgentConfig = field(default_factory=AgentConfig)
    send_callback: Callable[[dict], Awaitable[None]] | None = None


class AgentManager:
    def __init__(self, cdp_url: str = "http://localhost:9222"):
        self.cdp_url = cdp_url
        self.sessions: dict[str, Session] = {}

    async def check_cdp(self) -> bool:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{self.cdp_url}/json/version", timeout=5)
                return resp.status_code == 200
        except Exception:
            return False

    async def create_agent(
        self,
        session_id: str,
        config: AgentConfig,
        llm: BaseChatModel,
        send_callback: Callable[[dict], Awaitable[None]],
    ) -> Session:
        browser_profile = BrowserProfile(
            cdp_url=self.cdp_url,
            is_local=True,
            headless=False,
            disable_security=True,
        )
        browser_session = BrowserSession(browser_profile=browser_profile)

        agent = Agent(
            task=config.task,
            llm=llm,
            browser_session=browser_session,
            use_vision=config.use_vision,
            flash_mode=False,
            use_thinking=True,
            max_failures=5,
            max_actions_per_step=5,
            register_new_step_callback=self._make_step_callback(session_id),
            register_done_callback=self._make_done_callback(session_id),
        )

        session = Session(
            agent=agent,
            browser_session=browser_session,
            config=config,
            send_callback=send_callback,
        )
        self.sessions[session_id] = session
        return session

    async def run_agent(self, session_id: str):
        session = self.sessions.get(session_id)
        if not session or not session.agent:
            return

        try:
            await session.agent.run(max_steps=session.config.max_steps)
        except Exception as e:
            logger.error(f"Agent run error: {e}")
            if session.send_callback:
                await session.send_callback({
                    "type": "agent_error",
                    "session_id": session_id,
                    "error": str(e),
                })

    async def stop_agent(self, session_id: str):
        session = self.sessions.get(session_id)
        if not session:
            return
        if session.agent:
            session.agent.state.stopped = True
        if session.browser_session:
            await session.browser_session.kill()

    async def shutdown(self):
        for session_id in list(self.sessions.keys()):
            await self.stop_agent(session_id)
        self.sessions.clear()

    def _make_step_callback(self, session_id: str):
        async def on_step(
            browser_state: BrowserStateSummary,
            agent_output: AgentOutput,
            step_number: int,
        ):
            session = self.sessions.get(session_id)
            if not session or not session.send_callback:
                return
            await session.send_callback({
                "type": "agent_step",
                "session_id": session_id,
                "step_number": step_number,
                "thinking": agent_output.current_state.thinking,
                "evaluation": agent_output.current_state.evaluation_previous_goal,
                "next_goal": agent_output.current_state.next_goal,
                "actions": [
                    a.model_dump() for a in agent_output.current_state.actions
                ] if agent_output.current_state.actions else [],
                "url": browser_state.url if browser_state else "",
            })

        return on_step

    def _make_done_callback(self, session_id: str):
        async def on_done(history: AgentHistoryList):
            session = self.sessions.get(session_id)
            if not session or not session.send_callback:
                return
            result = history.final_result() if history else ""
            await session.send_callback({
                "type": "agent_result",
                "session_id": session_id,
                "success": history.is_successful() if history else False,
                "summary": result,
            })

        return on_done
