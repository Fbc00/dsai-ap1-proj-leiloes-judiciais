import json
import os
import re
import sys
from datetime import date
from pathlib import Path

PASTA_DESTINO: Path = Path("prompts") / "sessoes" / "claude-code"

MASCARAS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.DOTALL
        ),
        "[chave-privada]",
    ),
    (re.compile(r"\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}"), "[jwt]"),
    (
        re.compile(
            r"\b(?:sk-ant-[\w-]{10,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}"
            r"|glpat-[\w-]{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|AIza[\w-]{35})"
        ),
        "[token]",
    ),
    (re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}"), r"\1 [token]"),
    (re.compile(r"(?i)(://)[^\s/:@]+:[^\s/@]+@"), r"\1[credencial]@"),
    (
        re.compile(
            r"(?i)\b([\w.-]*(?:password|passwd|pwd|senha|secret|segredo|token|api[_-]?key|access[_-]?key"
            r"|private[_-]?key|credential|credencial)[\w.-]*)([\"']?\s*[:=]\s*)([\"']?)(?![$<{\[*])([^\s\"',;]+)\3"
        ),
        r"\1\2\3[mascarado]\3",
    ),
    (
        re.compile(
            r"(?i)(?<![\w-])(senha|password|passwd|secret|segredo|token|api key|chave)(?![\w-])"
            r"([\s:*=]{0,6})`[^`\n]+`"
        ),
        r"\1\2`[mascarado]`",
    ),
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b"), "[email]"),
    (re.compile(r"\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b"), "[processo]"),
    (re.compile(r"\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b"), "[cnpj]"),
    (re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"), "[cpf]"),
    (
        re.compile(r"(?:\+55\s?)?\(\d{2}\)\s?9?\d{4}-?\d{4}\b|\+55\s?\d{2}\s?9?\d{4}-?\d{4}\b"),
        "[telefone]",
    ),
    (re.compile(r"(?<![\w.-])(?:\d{11}|\d{14})(?![\w.-])"), "[documento]"),
    (re.compile(r"(?i)\b[\w-]+\.ngrok(?:-free)?\.(?:app|io|dev)\b"), "[host-tunel]"),
    (re.compile(r"(?i)(?<![\w:])(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}(?![\w:])"), "[ip]"),
    (re.compile(r"\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b"), "[ip]"),
    (re.compile(r"/home/[^/\s]+"), "~"),
    (
        re.compile(
            r"(?<![\w/+=-])(?=[A-Za-z0-9_+=-]*\d)(?=[A-Za-z0-9_+=-]*[a-z])(?=[A-Za-z0-9_+=-]*[A-Z])[A-Za-z0-9_+=-]{40,}"
        ),
        "[segredo]",
    ),
]

RUIDO_USUARIO: re.Pattern[str] = re.compile(
    r"^\s*(?:<local-command-|<task-notification>|<bash-stdout>|<bash-stderr>|\[Request interrupted)"
)
SYSTEM_REMINDER: re.Pattern[str] = re.compile(r"<system-reminder>.*?</system-reminder>", re.DOTALL)
LINHA_CREDENCIAL: re.Pattern[str] = re.compile(r"(?i)usu[aá]rio|login|credencia|senha|password")
PAR_CREDENCIAL: re.Pattern[str] = re.compile(r"(`[^`\n]+`)\s*/\s*`[^`\n]+`")
PEDIDO_CREDENCIAL: re.Pattern[str] = re.compile(r"(?i)senha|password|credencia|login")
LINHA_SOLTA: re.Pattern[str] = re.compile(r"\S{3,64}")
COMANDO: re.Pattern[str] = re.compile(r"<command-name>(.*?)</command-name>", re.DOTALL)
ARGUMENTOS: re.Pattern[str] = re.compile(r"<command-args>(.*?)</command-args>", re.DOTALL)


def raiz_projeto() -> Path:
    env: str | None = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def mascarar(texto: str) -> str:
    for padrao, substituto in MASCARAS:
        texto = padrao.sub(substituto, texto)
    return "\n".join(
        PAR_CREDENCIAL.sub(r"\1/`[mascarado]`", linha) if LINHA_CREDENCIAL.search(linha) else linha
        for linha in texto.split("\n")
    )


def mascarar_credenciais_soltas(texto: str) -> str:
    linhas: list[str] = texto.split("\n")
    soltas: list[int] = [
        i for i, linha in enumerate(linhas) if LINHA_SOLTA.fullmatch(linha.strip())
    ]
    if len(soltas) < 2:
        return texto
    for i in soltas:
        linhas[i] = "[mascarado]"
    return "\n".join(linhas)


def texto_usuario(conteudo: object) -> str:
    if isinstance(conteudo, str):
        partes: list[str] = [conteudo]
    elif isinstance(conteudo, list):
        partes = []
        for bloco in conteudo:
            if not isinstance(bloco, dict) or bloco.get("type") == "tool_result":
                return ""
            if bloco.get("type") == "text":
                partes.append(str(bloco.get("text", "")))
            elif bloco.get("type") == "image":
                partes.append("[imagem]")
    else:
        return ""
    texto = SYSTEM_REMINDER.sub("", "\n\n".join(partes)).strip()
    if not texto or RUIDO_USUARIO.match(texto):
        return ""
    comando = COMANDO.search(texto)
    if comando:
        argumentos = ARGUMENTOS.search(texto)
        sufixo: str = argumentos.group(1).strip() if argumentos else ""
        return f"{comando.group(1).strip()} {sufixo}".strip()
    return texto


def texto_assistente(conteudo: object) -> str:
    if isinstance(conteudo, str):
        return conteudo.strip()
    if not isinstance(conteudo, list):
        return ""
    partes: list[str] = [
        str(bloco.get("text", "")).strip()
        for bloco in conteudo
        if isinstance(bloco, dict) and bloco.get("type") == "text"
    ]
    return "\n\n".join(p for p in partes if p)


def extrair(transcript: Path) -> tuple[str, list[tuple[str, str]]]:
    data: str = ""
    turnos: list[tuple[str, str]] = []
    with transcript.open(encoding="utf-8") as f:
        for linha in f:
            try:
                registro: dict[str, object] = json.loads(linha)
            except json.JSONDecodeError:
                continue
            timestamp = registro.get("timestamp")
            if not data and isinstance(timestamp, str) and len(timestamp) >= 10:
                data = timestamp[:10]
            if registro.get("isMeta") or registro.get("isSidechain"):
                continue
            mensagem = registro.get("message")
            if not isinstance(mensagem, dict):
                continue
            tipo = registro.get("type")
            if tipo == "user":
                papel, texto = "Usuário", texto_usuario(mensagem.get("content"))
            elif tipo == "assistant":
                papel, texto = "Claude", texto_assistente(mensagem.get("content"))
            else:
                continue
            if not texto:
                continue
            if papel == "Usuário" and turnos and PEDIDO_CREDENCIAL.search(turnos[-1][1]):
                texto = mascarar_credenciais_soltas(texto)
            if turnos and turnos[-1][0] == papel:
                turnos[-1] = (papel, f"{turnos[-1][1]}\n\n{texto}")
            else:
                turnos.append((papel, texto))
    return data or date.today().isoformat(), turnos


def renderizar(sessao: str, data: str, turnos: list[tuple[str, str]]) -> str:
    blocos: list[str] = [f"# Sessão {sessao}\n\nData: {data}"]
    blocos.extend(f"## {papel}\n\n{mascarar(texto)}" for papel, texto in turnos)
    return "\n\n".join(blocos) + "\n"


def exportar(payload: dict[str, object]) -> Path | None:
    origem = Path(str(payload.get("transcript_path", "")))
    sessao = str(payload.get("session_id", "")).strip()
    if not sessao or not origem.is_file():
        return None
    data, turnos = extrair(origem)
    if not turnos:
        return None
    destino_dir: Path = raiz_projeto() / PASTA_DESTINO
    destino_dir.mkdir(parents=True, exist_ok=True)
    existentes: list[Path] = sorted(destino_dir.glob(f"*-{sessao}.md"))
    destino: Path = existentes[0] if existentes else destino_dir / f"{data}-{sessao}.md"
    destino.write_text(renderizar(sessao, data, turnos), encoding="utf-8")
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
