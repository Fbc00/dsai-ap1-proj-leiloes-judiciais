import io

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app import cli
from app.security.passwords import verificar_senha


def test_ler_senha_stdin_le_uma_linha(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin", io.StringIO("senha-stdin-123\n"))
    assert cli.ler_senha(senha_stdin=True) == "senha-stdin-123"


async def test_executar_criar_usuario_com_perfil(session: AsyncSession) -> None:
    usuario = await cli.executar_criar_usuario(
        session, "op", "Operadora", "operador", "senha-stdin-123"
    )
    assert usuario.username == "op"
    assert usuario.perfil == "operador"
    assert usuario.ativo is True
    assert verificar_senha("senha-stdin-123", usuario.senha_hash)


async def test_executar_criar_usuario_duplicado_sai_com_1(
    session: AsyncSession, capsys: pytest.CaptureFixture[str]
) -> None:
    await cli.executar_criar_usuario(session, "op", "Operadora", "operador", "senha-stdin-123")
    with pytest.raises(SystemExit) as excinfo:
        await cli.executar_criar_usuario(session, "op", "Outra", "admin", "senha-stdin-123")
    assert excinfo.value.code == 1
    assert "Username já existe" in capsys.readouterr().out


async def test_executar_criar_usuario_senha_curta_sai_com_1(session: AsyncSession) -> None:
    with pytest.raises(SystemExit) as excinfo:
        await cli.executar_criar_usuario(session, "op", "Operadora", "operador", "curta")
    assert excinfo.value.code == 1


def test_main_aceita_perfil_e_senha_stdin(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[tuple[str, str, str, bool]] = []

    async def _fake(username: str, nome: str, perfil: str, senha_stdin: bool) -> None:
        chamadas.append((username, nome, perfil, senha_stdin))

    monkeypatch.setattr(cli, "_criar_usuario", _fake)
    cli.main(
        ["criar-usuario", "op", "--nome", "Operadora", "--perfil", "operador", "--senha-stdin"]
    )
    assert chamadas == [("op", "Operadora", "operador", True)]
