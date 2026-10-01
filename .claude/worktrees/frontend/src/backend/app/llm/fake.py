from pathlib import Path

from pydantic import BaseModel

FIXTURES_DIR: Path = Path(__file__).parent / "fixtures"


class FakeLLMClient:
    def __init__(self, fixtures_dir: Path = FIXTURES_DIR) -> None:
        self._dir = fixtures_dir

    async def structured[T: BaseModel](self, *, system: str, user: str, schema: type[T]) -> T:
        caminho = self._dir / f"{schema.__name__}.json"
        return schema.model_validate_json(caminho.read_text(encoding="utf-8"))
