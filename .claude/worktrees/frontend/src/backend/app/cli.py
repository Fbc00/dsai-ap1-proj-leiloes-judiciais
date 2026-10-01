import argparse
import asyncio
import getpass
import sys
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session_factory
from app.errors import ErroDominio
from app.security.auth import criar_usuario, limpar_sessoes_expiradas
from app.security.models import Usuario
from app.security.schemas import SENHA_MINIMA

PERFIS: tuple[str, ...] = ("admin", "operador")


def ler_senha(senha_stdin: bool) -> str:
    if senha_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    senha = getpass.getpass("Senha: ")
    if senha != getpass.getpass("Confirme a senha: "):
        print("As senhas não conferem")
        sys.exit(1)
    return senha


async def executar_criar_usuario(
    session: AsyncSession, username: str, nome: str, perfil: str, senha: str
) -> Usuario:
    if len(senha) < SENHA_MINIMA:
        print(f"Senha inválida: precisa ter {SENHA_MINIMA}+ caracteres")
        sys.exit(1)
    try:
        return await criar_usuario(session, username, nome, senha, perfil)
    except ErroDominio as exc:
        print(exc.detail)
        sys.exit(1)


async def _criar_usuario(username: str, nome: str, perfil: str, senha_stdin: bool) -> None:
    senha = ler_senha(senha_stdin)
    async with get_session_factory()() as session:
        usuario = await executar_criar_usuario(session, username, nome, perfil, senha)
    print(f"Usuário {usuario.username} ({usuario.perfil}) criado ({usuario.id})")


async def _limpar_sessoes() -> None:
    async with get_session_factory()() as session:
        total = await limpar_sessoes_expiradas(session, datetime.now(UTC))
    print(f"{total} sessão(ões) expirada(s) removida(s)")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="comando", required=True)
    criar = sub.add_parser("criar-usuario")
    criar.add_argument("username")
    criar.add_argument("--nome", required=True)
    criar.add_argument("--perfil", choices=PERFIS, default="admin")
    criar.add_argument("--senha-stdin", action="store_true")
    sub.add_parser("limpar-sessoes")
    args = parser.parse_args(argv)
    if args.comando == "criar-usuario":
        asyncio.run(_criar_usuario(args.username, args.nome, args.perfil, args.senha_stdin))
    else:
        asyncio.run(_limpar_sessoes())


if __name__ == "__main__":
    main()
