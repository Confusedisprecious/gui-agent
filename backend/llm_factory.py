import logging

from browser_use.llm.base import BaseChatModel
from browser_use.llm.deepseek.chat import ChatDeepSeek

logger = logging.getLogger(__name__)


def create_llm(
    model: str = "deepseek-v4-flash",
    api_key: str = "",
    base_url: str = "https://api.deepseek.com/v1",
) -> BaseChatModel:
    """Create an LLM instance from configuration."""
    model_lower = model.lower()

    if "deepseek" in model_lower:
        return ChatDeepSeek(
            model=model,
            api_key=api_key,
            base_url=base_url,
        )

    # OpenAI-compatible fallback
    from browser_use.llm.openai.chat import ChatOpenAI

    logger.info(f"Using OpenAI-compatible provider for model: {model}")
    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
    )
