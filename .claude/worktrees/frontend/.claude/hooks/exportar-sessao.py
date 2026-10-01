import json
import os
import shutil
import sys
from datetime import date
from pathlib import Path

PASTA_DESTINO: Path = Path("prompts") / "sessoes" / "claude-code"


def raiz_projeto() -> Path:
    env: str | None = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def primeira_data(transcript: Path) -> str:
    with transcript.open(encoding="utf-8") as f:
        for linha in f:
            try:
                registro: dict[str, object] = json.loads(linha)
            except json.JSONDecodeError:
                continue
            timestamp = registro.get("timestamp")
            if isinstance(timestamp, str) and len(timestamp) >= 10:
                return timestamp[:10]
    return date.today().isoformat()


def exportar(payload: dict[str, object]) -> Path | None:
    origem = Path(str(payload.get("transcript_path", "")))
    sessao = str(payload.get("session_id", "")).strip()
    if not sessao or not origem.is_file():
        return None
    destino_dir: Path = raiz_projeto() / PASTA_DESTINO
    destino_dir.mkdir(parents=True, exist_ok=True)
    existentes: list[Path] = sorted(destino_dir.glob(f"*-{sessao}.jsonl"))
    destino: Path = existentes[0] if existentes else destino_dir / f"{primeira_data(origem)}-{sessao}.jsonl"
    shutil.copyfile(origem, destino)
    return destino


def main() -> int:
    try:
        payload: dict[str, object] = json.load(sys.stdin)
        exportar(payload)
    except Exception as erro:
        print(f"exportar-sessao: {erro}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
