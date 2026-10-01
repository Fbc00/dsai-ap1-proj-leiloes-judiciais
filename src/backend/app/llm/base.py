from typing import Protocol

from pydantic import BaseModel


class LLMClient(Protocol):
    async def structured[T: BaseModel](self, *, system: str, user: str, schema: type[T]) -> T: ...
