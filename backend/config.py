import os
from pathlib import Path

# Server
WS_PORT: int = int(os.getenv("MEDICAL_AGENT_PORT", "8765"))
WS_HOST: str = os.getenv("MEDICAL_AGENT_HOST", "127.0.0.1")

# CDP
CDP_URL: str = os.getenv("MEDICAL_AGENT_CDP_URL", "http://localhost:9222")

# Default LLM (loaded from 模型密钥.txt)
MODEL_KEYS_FILE: Path = Path(__file__).parent.parent.parent / "模型密钥.txt"

# Agent defaults
DEFAULT_MAX_STEPS: int = int(os.getenv("MEDICAL_AGENT_MAX_STEPS", "50"))
DEFAULT_USE_VISION: bool = os.getenv("MEDICAL_AGENT_USE_VISION", "false").lower() == "true"
