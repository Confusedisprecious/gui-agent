from __future__ import annotations

from pydantic import BaseModel, Field


class AgentConfig(BaseModel):
    task: str = ""
    api_key: str = ""
    model: str = "deepseek-v4-flash"
    base_url: str = "https://api.deepseek.com/v1"
    max_steps: int = 50
    use_vision: bool = False
    skills: list[str] = []


class WSMessage(BaseModel):
    type: str
    session_id: str = ""
    config: dict | None = None
    message: str = ""
    data: dict | None = None
    error: str | None = None


class ChatRequest(BaseModel):
    message: str
    history: list[dict[str, str]] = []
    config: dict = {}
