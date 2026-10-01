from typing import Annotated

from fastapi import Depends

from app.config import Settings, get_settings
from app.llm.base import LLMClient
from app.llm.fake import FakeLLMClient


def get_llm_client(settings: Settings) -> LLMClient:
    if settings.LLM_PROVIDER == "fake":
        return FakeLLMClient()
    if settings.LLM_PROVIDER == "anthropic":
        from app.llm.anthropic import AnthropicLLMClient

        return AnthropicLLMClient(settings)
    raise ValueError(f"LLM_PROVIDER desconhecido: {settings.LLM_PROVIDER}")


def llm_client_dep(settings: Annotated[Settings, Depends(get_settings)]) -> LLMClient:
    return get_llm_client(settings)


LLMDep = Annotated[LLMClient, Depends(llm_client_dep)]

__all__ = ["LLMClient", "LLMDep", "get_llm_client", "llm_client_dep"]
