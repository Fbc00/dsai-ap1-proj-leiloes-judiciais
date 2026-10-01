from datetime import date, datetime, time, timedelta
from uuid import UUID

import holidays
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.agenda.models import BloqueioAgenda, Leilao
from app.agenda.schemas import BloqueioCreate, FeriadoOut, LeilaoCreate, SugestaoOut
from app.config import Settings
from app.errors import ErroDominio
from app.processos.models import Processo

JANELA_INICIO_DIAS: int = 30
JANELA_FIM_DIAS: int = 45
INTERVALO_SEGUNDO: timedelta = timedelta(days=7)
STATUS_AGENDADO: str = "agendado"
STATUS_CANCELADO: str = "cancelado"
PAIS: str = "BR"
UF: str = "PA"


def hoje_local(settings: Settings) -> date:
    return datetime.now(settings.tz).date()


def candidatos(hoje: date) -> list[date]:
    return [hoje + timedelta(days=n) for n in range(JANELA_INICIO_DIAS, JANELA_FIM_DIAS + 1)]


def dia_util(d: date) -> bool:
    return d.weekday() < 5


def combinar(d: date, settings: Settings) -> datetime:
    return datetime.combine(d, settings.horario_leilao, tzinfo=settings.tz)


def _inicio_do_dia(d: date, settings: Settings) -> datetime:
    return datetime.combine(d, time.min, tzinfo=settings.tz)


def _fim_do_dia(d: date, settings: Settings) -> datetime:
    return datetime.combine(d, time.max, tzinfo=settings.tz)


def feriados_do_ano(anos: list[int]) -> dict[date, str]:
    calendario = holidays.country_holidays(PAIS, subdiv=UF, years=anos)
    return {dia: str(nome) for dia, nome in sorted(calendario.items())}


def _anos(datas: list[date]) -> list[int]:
    return sorted({d.year for d in datas})


def motivo_indisponivel(
    d: date, bloqueios: dict[date, str], feriados: dict[date, str]
) -> str | None:
    if not dia_util(d):
        return "Data não é dia útil"
    if d in feriados:
        return f"Data é feriado: {feriados[d]}"
    if d in bloqueios:
        return f"Data bloqueada: {bloqueios[d]}"
    return None


def motivo_par_indisponivel(
    d: date, bloqueios: dict[date, str], feriados: dict[date, str]
) -> str | None:
    motivo = motivo_indisponivel(d, bloqueios, feriados)
    if motivo is not None:
        return motivo
    segundo = d + INTERVALO_SEGUNDO
    motivo_segundo = motivo_indisponivel(segundo, bloqueios, feriados)
    if motivo_segundo is not None:
        return f"Segundo leilão ({segundo:%d/%m/%Y}) indisponível: {motivo_segundo}"
    return None


async def bloqueios_no_intervalo(session: AsyncSession, inicio: date, fim: date) -> dict[date, str]:
    stmt = select(BloqueioAgenda.data, BloqueioAgenda.motivo).where(
        BloqueioAgenda.data.between(inicio, fim)
    )
    return {dia: motivo for dia, motivo in (await session.execute(stmt)).all()}


async def sugerir_datas(session: AsyncSession, settings: Settings, hoje: date) -> SugestaoOut:
    datas = candidatos(hoje)
    fim = datas[-1] + INTERVALO_SEGUNDO
    bloqueios = await bloqueios_no_intervalo(session, datas[0], fim)
    feriados = feriados_do_ano(_anos([datas[0], fim]))
    for d in datas:
        if motivo_par_indisponivel(d, bloqueios, feriados) is None:
            primeiro = combinar(d, settings)
            return SugestaoOut(
                primeiro_leilao_em=primeiro, segundo_leilao_em=primeiro + INTERVALO_SEGUNDO
            )
    raise ErroDominio(409, "Sem data disponível entre 30 e 45 dias")


async def leilao_ativo(session: AsyncSession, processo_id: UUID) -> Leilao | None:
    stmt = select(Leilao).where(Leilao.processo_id == processo_id, Leilao.status == STATUS_AGENDADO)
    return (await session.execute(stmt)).scalar_one_or_none()


async def criar_leilao(
    session: AsyncSession, settings: Settings, dados: LeilaoCreate, hoje: date
) -> Leilao:
    processo = await session.get(Processo, dados.processo_id)
    if processo is None:
        raise ErroDominio(404, "Processo não encontrado")
    if processo.status != "analisado":
        raise ErroDominio(409, "Processo precisa estar analisado")
    if await leilao_ativo(session, processo.id) is not None:
        raise ErroDominio(409, "Processo já tem leilão agendado")

    if dados.primeiro_leilao_data is None:
        primeiro = (await sugerir_datas(session, settings, hoje)).primeiro_leilao_em
    else:
        d = dados.primeiro_leilao_data
        datas = candidatos(hoje)
        if d < datas[0] or d > datas[-1]:
            raise ErroDominio(422, "Data fora da janela de 30 a 45 dias")
        segundo = d + INTERVALO_SEGUNDO
        bloqueios = await bloqueios_no_intervalo(session, d, segundo)
        feriados = feriados_do_ano(_anos([d, segundo]))
        motivo = motivo_par_indisponivel(d, bloqueios, feriados)
        if motivo is not None:
            raise ErroDominio(422, motivo)
        primeiro = combinar(d, settings)

    leilao = Leilao(
        processo_id=processo.id,
        primeiro_leilao_em=primeiro,
        segundo_leilao_em=primeiro + INTERVALO_SEGUNDO,
        status=STATUS_AGENDADO,
    )
    session.add(leilao)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ErroDominio(409, "Processo já tem leilão agendado") from None
    await session.refresh(leilao)
    return leilao


async def obter_leilao(session: AsyncSession, leilao_id: UUID) -> Leilao:
    leilao = await session.get(Leilao, leilao_id)
    if leilao is None:
        raise ErroDominio(404, "Leilão não encontrado")
    return leilao


async def cancelar(session: AsyncSession, leilao_id: UUID) -> None:
    leilao = await obter_leilao(session, leilao_id)
    leilao.status = STATUS_CANCELADO
    await session.commit()


async def listar_leiloes(
    session: AsyncSession, settings: Settings, inicio: date | None, fim: date | None
) -> list[Leilao]:
    stmt = select(Leilao).order_by(Leilao.primeiro_leilao_em.asc())
    if inicio is not None and fim is not None:
        inicio_dt, fim_dt = _inicio_do_dia(inicio, settings), _fim_do_dia(fim, settings)
        stmt = stmt.where(
            or_(
                Leilao.primeiro_leilao_em.between(inicio_dt, fim_dt),
                Leilao.segundo_leilao_em.between(inicio_dt, fim_dt),
            )
        )
    return list((await session.execute(stmt)).scalars().all())


async def listar_bloqueios(session: AsyncSession) -> list[BloqueioAgenda]:
    stmt = select(BloqueioAgenda).order_by(BloqueioAgenda.data.asc())
    return list((await session.execute(stmt)).scalars().all())


async def criar_bloqueio(session: AsyncSession, dados: BloqueioCreate) -> BloqueioAgenda:
    existente = await session.execute(
        select(BloqueioAgenda).where(BloqueioAgenda.data == dados.data)
    )
    if existente.scalar_one_or_none() is not None:
        raise ErroDominio(409, "Data já bloqueada")
    bloqueio = BloqueioAgenda(data=dados.data, motivo=dados.motivo)
    session.add(bloqueio)
    await session.commit()
    await session.refresh(bloqueio)
    return bloqueio


async def excluir_bloqueio(session: AsyncSession, bloqueio_id: UUID) -> None:
    bloqueio = await session.get(BloqueioAgenda, bloqueio_id)
    if bloqueio is None:
        raise ErroDominio(404, "Bloqueio não encontrado")
    await session.delete(bloqueio)
    await session.commit()


def listar_feriados(ano: int) -> list[FeriadoOut]:
    return [FeriadoOut(data=dia, motivo=nome) for dia, nome in feriados_do_ano([ano]).items()]
