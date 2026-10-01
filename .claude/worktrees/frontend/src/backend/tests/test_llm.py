from pathlib import Path

import pytest
from pydantic import BaseModel, SecretStr

from app.config import Settings
from app.llm import get_llm_client
from app.llm.anthropic import AnthropicLLMClient
from app.llm.fake import FakeLLMClient


class Pessoa(BaseModel):
    nome: str
    idade: int


async def test_fake_devolve_fixture_validada_no_schema(tmp_path: Path) -> None:
    (tmp_path / "Pessoa.json").write_text('{"nome": "Ana", "idade": 30}', encoding="utf-8")
    resultado = await FakeLLMClient(tmp_path).structured(system="s", user="u", schema=Pessoa)
    assert resultado == Pessoa(nome="Ana", idade=30)


async def test_fake_sem_fixture_levanta(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        await FakeLLMClient(tmp_path).structured(system="s", user="u", schema=Pessoa)


def test_get_llm_client_fake(settings_teste: Settings) -> None:
    assert isinstance(get_llm_client(settings_teste), FakeLLMClient)


def test_get_llm_client_anthropic_nao_chama_rede(settings_teste: Settings) -> None:
    settings = settings_teste.model_copy(
        update={"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": SecretStr("sk-teste")}
    )
    assert isinstance(get_llm_client(settings), AnthropicLLMClient)


def test_get_llm_client_desconhecido(settings_teste: Settings) -> None:
    settings = settings_teste.model_copy(update={"LLM_PROVIDER": "oraculo"})
    with pytest.raises(ValueError, match="LLM_PROVIDER desconhecido"):
        get_llm_client(settings)
