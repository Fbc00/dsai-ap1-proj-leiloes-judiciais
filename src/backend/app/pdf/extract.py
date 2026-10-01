import re
from pathlib import Path

from pypdf import PdfReader

_ESPACOS = re.compile(r"[ \t\u00a0]+")
_QUEBRAS = re.compile(r"\n{3,}")


def extract_text(path: Path) -> str:
    reader = PdfReader(str(path))
    paginas = [(pagina.extract_text() or "").strip() for pagina in reader.pages]
    texto = "\n\n".join(p for p in paginas if p)
    texto = _ESPACOS.sub(" ", texto)
    texto = re.sub(r" *\n *", "\n", texto)
    return _QUEBRAS.sub("\n\n", texto).strip()
