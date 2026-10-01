import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ErroDominio
from app.security.models import Sessao, Usuario
from app.security.passwords import HASH_DUMMY, hash_senha, verificar_senha
from app.security.schemas import SenhaIn, UsuarioUpdate


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def obter_por_username(session: AsyncSession, username: str) -> Usuario | None:
    stmt = select(Usuario).where(Usuario.username == username)
    return (await session.execute(stmt)).scalar_one_or_none()


async def criar_usuario(
    session: AsyncSession, username: str, nome: str, senha: str, perfil: str = "admin"
) -> Usuario:
    if await obter_por_username(session, username) is not None:
        raise ErroDominio(409, "Username já existe")
    usuario = Usuario(username=username, nome=nome, senha_hash=hash_senha(senha), perfil=perfil)
    session.add(usuario)
    await session.commit()
    await session.refresh(usuario)
    return usuario


async def autenticar(session: AsyncSession, username: str, senha: str) -> Usuario | None:
    stmt = select(Usuario).where(Usuario.username == username, Usuario.ativo.is_(True))
    usuario = (await session.execute(stmt)).scalar_one_or_none()
    hash_alvo = usuario.senha_hash if usuario is not None else HASH_DUMMY
    senha_ok = verificar_senha(senha, hash_alvo)
    if usuario is None or not senha_ok:
        return None
    return usuario


async def criar_sessao(
    session: AsyncSession, usuario: Usuario, ttl_horas: int
) -> tuple[str, Sessao]:
    token = secrets.token_urlsafe(32)
    sessao = Sessao(
        token_hash=_hash_token(token),
        usuario_id=usuario.id,
        expira_em=datetime.now(UTC) + timedelta(hours=ttl_horas),
    )
    session.add(sessao)
    await session.commit()
    await session.refresh(sessao)
    return token, sessao


async def usuario_por_token(session: AsyncSession, token: str, agora: datetime) -> Usuario | None:
    stmt = (
        select(Usuario)
        .join(Sessao, Sessao.usuario_id == Usuario.id)
        .where(
            Sessao.token_hash == _hash_token(token),
            Sessao.expira_em > agora,
            Usuario.ativo.is_(True),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def encerrar_sessao(session: AsyncSession, token: str) -> None:
    await session.execute(delete(Sessao).where(Sessao.token_hash == _hash_token(token)))
    await session.commit()


async def encerrar_sessoes_do_usuario(
    session: AsyncSession, usuario_id: UUID, manter_token: str | None = None
) -> int:
    stmt = delete(Sessao).where(Sessao.usuario_id == usuario_id)
    if manter_token is not None:
        stmt = stmt.where(Sessao.token_hash != _hash_token(manter_token))
    resultado = await session.execute(stmt)
    await session.commit()
    return resultado.rowcount or 0


async def trocar_propria_senha(
    session: AsyncSession, usuario: Usuario, dados: SenhaIn, token_atual: str
) -> None:
    if not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise ErroDominio(400, "Senha atual incorreta")
    usuario.senha_hash = hash_senha(dados.nova_senha)
    await session.flush()
    await encerrar_sessoes_do_usuario(session, usuario.id, manter_token=token_atual)


async def limpar_sessoes_expiradas(session: AsyncSession, agora: datetime) -> int:
    resultado = await session.execute(delete(Sessao).where(Sessao.expira_em <= agora))
    await session.commit()
    return resultado.rowcount or 0


async def listar_usuarios(session: AsyncSession) -> list[Usuario]:
    stmt = select(Usuario).order_by(Usuario.username.asc())
    return list((await session.execute(stmt)).scalars().all())


async def obter_usuario(session: AsyncSession, usuario_id: UUID) -> Usuario:
    usuario = await session.get(Usuario, usuario_id)
    if usuario is None:
        raise ErroDominio(404, "Usuário não encontrado")
    return usuario


async def atualizar_usuario(
    session: AsyncSession, ator: Usuario, alvo_id: UUID, dados: UsuarioUpdate
) -> Usuario:
    alvo = await obter_usuario(session, alvo_id)
    muda_perfil = dados.perfil is not None and dados.perfil != alvo.perfil
    desativa = dados.ativo is False
    if alvo.id == ator.id and (muda_perfil or desativa):
        raise ErroDominio(409, "Não é possível alterar o próprio perfil ou status")
    if dados.nome is not None:
        alvo.nome = dados.nome
    if dados.perfil is not None:
        alvo.perfil = dados.perfil
    if dados.ativo is not None:
        alvo.ativo = dados.ativo
    if dados.nova_senha is not None:
        alvo.senha_hash = hash_senha(dados.nova_senha)
    await session.flush()
    if dados.nova_senha is not None or desativa:
        await encerrar_sessoes_do_usuario(session, alvo.id)
    await session.commit()
    await session.refresh(alvo)
    return alvo
