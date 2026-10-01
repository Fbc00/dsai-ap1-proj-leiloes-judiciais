from anthropic import AsyncAnthropic
from pydantic import BaseModel

from app.config import Settings

MAX_TOKENS_SAIDA: int = 16000


class AnthropicLLMClient:
    def __init__(self, settings: Settings) -> None:
        chave = settings.ANTHROPIC_API_KEY.get_secret_value()
        self._client = AsyncAnthropic(api_key=chave or None)
        self._model = settings.ANTHROPIC_MODEL

    async def structured[T: BaseModel](self, *, system: str, user: str, schema: type[T]) -> T:
        resposta = await self._client.messages.parse(
            model=self._model,
            max_tokens=MAX_TOKENS_SAIDA,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
        )
        parsed = resposta.parsed_output
        if parsed is None:
            raise RuntimeError("Resposta do modelo sem conteúdo estruturado")
        return parsed
