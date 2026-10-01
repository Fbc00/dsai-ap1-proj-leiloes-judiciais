from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agenda import service
from app.agenda.models import Leilao
from app.agenda.schemas import BloqueioCreate, LeilaoCreate
from app.config import Settings
from app.errors import ErroDominio
from app.processos.models import Processo

HOJE: date = date(2026, 10, 1)
FINADOS: date = date(2026, 11, 2)
PRIMEIRO_LIVRE: date = date(2026, 11, 3)
SEGUNDO_LIVRE: date = date(2026, 11, 10)
CONSCIENCIA_NEGRA: date = date(2026, 11, 20)
ADESAO_PARA: date = date(2026, 8, 15)


async def bloquear(session: AsyncSession, *datas: date, motivo: str = "Recesso forense") -> None:
    for d in datas:
        await service.criar_bloqueio(session, BloqueioCreate(data=d, motivo=motivo))


def local(dt: datetime, settings: Settings) -> datetime:
    return dt.astimezone(settings.tz)


def test_candidatos_cobre_30_a_45_dias_corridos() -> None:
    datas = service.candidatos(HOJE)
    assert datas[0] == date(2026, 10, 31)
    assert datas[-1] == date(2026, 11, 15)
    assert len(datas) == 16


def test_motivo_indisponivel_mensagens_exatas() -> None:
    feriados = {FINADOS: "Finados"}
    bloqueios = {PRIMEIRO_LIVRE: "Recesso forense"}
    assert (
        service.motivo_indisponivel(date(2026, 10, 31), bloqueios, feriados)
        == "Data não é dia útil"
    )
    assert service.motivo_indisponivel(FINADOS, bloqueios, feriados) == "Data é feriado: Finados"
    assert (
        service.motivo_indisponivel(PRIMEIRO_LIVRE, bloqueios, feriados)
        == "Data bloqueada: Recesso forense"
    )
    assert service.motivo_indisponivel(date(2026, 11, 4), bloqueios, feriados) is None


def test_motivo_par_descarta_d_quando_d_mais_7_cai_em_feriado() -> None:
    feriados = {CONSCIENCIA_NEGRA: "Consciência Negra"}
    motivo = service.motivo_par_indisponivel(date(2026, 11, 13), {}, feriados)
    assert motivo == "Segundo leilão (20/11/2026) indisponível: Data é feriado: Consciência Negra"
    assert service.motivo_par_indisponivel(date(2026, 11, 16), {}, feriados) is None


def test_feriados_do_ano_inclui_nacionais_e_do_para() -> None:
    feriados = service.feriados_do_ano([2026])
    assert FINADOS in feriados
    assert "Finados" in feriados[FINADOS]
    assert CONSCIENCIA_NEGRA in feriados
    assert ADESAO_PARA in feriados
    assert "Pará" in feriados[ADESAO_PARA]
    assert all(d.year == 2026 for d in feriados)


async def test_sugestao_pula_fim_de_semana_e_finados(
    session: AsyncSession, settings_teste: Settings
) -> None:
    sugestao = await service.sugerir_datas(session, settings_teste, HOJE)
    primeiro = local(sugestao.primeiro_leilao_em, settings_teste)
    assert primeiro.date() == PRIMEIRO_LIVRE
    assert (primeiro.hour, primeiro.minute) == (10, 0)


async def test_segundo_e_primeiro_mais_sete_na_mesma_hora(
    session: AsyncSession, settings_teste: Settings
) -> None:
    sugestao = await service.sugerir_datas(session, settings_teste, HOJE)
    assert sugestao.segundo_leilao_em - sugestao.primeiro_leilao_em == timedelta(days=7)
    assert local(sugestao.segundo_leilao_em, settings_teste).date() == SEGUNDO_LIVRE
    assert local(sugestao.segundo_leilao_em, settings_teste).hour == 10


async def test_sugestao_pula_feriado_nacional_consciencia_negra(
    session: AsyncSession, settings_teste: Settings
) -> None:
    sugestao = await service.sugerir_datas(session, settings_teste, date(2026, 10, 21))
    assert local(sugestao.primeiro_leilao_em, settings_teste).date() == date(2026, 11, 23)


async def test_sugestao_descarta_d_quando_d_mais_7_e_feriado(
    session: AsyncSession, settings_teste: Settings
) -> None:
    sugestao = await service.sugerir_datas(session, settings_teste, date(2026, 10, 14))
    assert local(sugestao.primeiro_leilao_em, settings_teste).date() == date(2026, 11, 16)


async def test_sugestao_pula_bloqueio(session: AsyncSession, settings_teste: Settings) -> None:
    await bloquear(session, PRIMEIRO_LIVRE)
    sugestao = await service.sugerir_datas(session, settings_teste, HOJE)
    assert local(sugestao.primeiro_leilao_em, settings_teste).date() == date(2026, 11, 4)


async def test_sugestao_exige_segundo_leilao_livre(
    session: AsyncSession, settings_teste: Settings
) -> None:
    await bloquear(session, SEGUNDO_LIVRE)
    sugestao = await service.sugerir_datas(session, settings_teste, HOJE)
    assert local(sugestao.primeiro_leilao_em, settings_teste).date() == date(2026, 11, 4)


async def test_dois_leiloes_no_mesmo_dia_sao_aceitos(
    session: AsyncSession,
    settings_teste: Settings,
    criar_processo_analisado: Callable[[], Awaitable[Processo]],
) -> None:
    a = await criar_processo_analisado()
    b = await criar_processo_analisado()
    leilao_a = await service.criar_leilao(
        session, settings_teste, LeilaoCreate(processo_id=a.id), HOJE
    )
    leilao_b = await service.criar_leilao(
        session,
        settings_teste,
        LeilaoCreate(processo_id=b.id, primeiro_leilao_data=PRIMEIRO_LIVRE),
        HOJE,
    )
    assert local(leilao_a.primeiro_leilao_em, settings_teste).date() == PRIMEIRO_LIVRE
    assert local(leilao_b.primeiro_leilao_em, settings_teste).date() == PRIMEIRO_LIVRE
    sugestao = await service.sugerir_datas(session, settings_teste, HOJE)
    assert local(sugestao.primeiro_leilao_em, settings_teste).date() == PRIMEIRO_LIVRE


async def test_sem_data_livre_409(session: AsyncSession, settings_teste: Settings) -> None:
    uteis = [d for d in service.candidatos(HOJE) if service.dia_util(d)]
    await bloquear(session, *uteis)
    with pytest.raises(ErroDominio) as excinfo:
        await service.sugerir_datas(session, settings_teste, HOJE)
    assert excinfo.value.status == 409
    assert excinfo.value.detail == "Sem data disponível entre 30 e 45 dias"


async def criar_manual(
    session: AsyncSession, settings: Settings, processo: Processo, d: date
) -> Leilao:
    return await service.criar_leilao(
        session, settings, LeilaoCreate(processo_id=processo.id, primeiro_leilao_data=d), HOJE
    )


async def test_manual_fora_da_janela_422(
    session: AsyncSession, settings_teste: Settings, processo_analisado: Processo
) -> None:
    with pytest.raises(ErroDominio) as excinfo:
        await criar_manual(session, settings_teste, processo_analisado, HOJE + timedelta(days=10))
    assert excinfo.value.status == 422
    assert excinfo.value.detail == "Data fora da janela de 30 a 45 dias"


async def test_manual_em_sabado_422(
    session: AsyncSession, settings_teste: Settings, processo_analisado: Processo
) -> None:
    with pytest.raises(ErroDominio) as excinfo:
        await criar_manual(session, settings_teste, processo_analisado, date(2026, 10, 31))
    assert excinfo.value.status == 422
    assert excinfo.value.detail == "Data não é dia útil"


async def test_manual_em_feriado_422(
    session: AsyncSession, settings_teste: Settings, processo_analisado: Processo
) -> None:
    with pytest.raises(ErroDominio) as excinfo:
        await criar_manual(session, settings_teste, processo_analisado, FINADOS)
    assert excinfo.value.status == 422
    assert excinfo.value.detail.startswith("Data é feriado: ")
    assert "Finados" in excinfo.value.detail


async def test_manual_em_dia_bloqueado_422(
    session: AsyncSession, settings_teste: Settings, processo_analisado: Processo
) -> None:
    await bloquear(session, PRIMEIRO_LIVRE, motivo="Recesso forense")
    with pytest.raises(ErroDominio) as excinfo:
        await criar_manual(session, settings_teste, processo_analisado, PRIMEIRO_LIVRE)
    assert excinfo.value.detail == "Data bloqueada: Recesso forense"


async def test_manual_com_segundo_leilao_bloqueado_422(
    session: AsyncSession, settings_teste: Settings, processo_analisado: Processo
) -> None:
    await bloquear(session, SEGUNDO_LIVRE, motivo="Recesso forense")
    with pytest.raises(ErroDominio) as excinfo:
        await criar_manual(session, settings_teste, processo_analisado, PRIMEIRO_LIVRE)
    assert (
        excinfo.value.detail
        == "Segundo leilão (10/11/2026) indisponível: Data bloqueada: Recesso forense"
    )


async def test_endpoint_sugestao_respeita_invariantes(
    cliente_logado: AsyncClient, settings_teste: Settings
) -> None:
    resposta = await cliente_logado.get("/api/agenda/sugestao")
    assert resposta.status_code == 200
    primeiro = local(datetime.fromisoformat(resposta.json()["primeiro_leilao_em"]), settings_teste)
    segundo = local(datetime.fromisoformat(resposta.json()["segundo_leilao_em"]), settings_teste)
    hoje = service.hoje_local(settings_teste)
    assert hoje + timedelta(days=30) <= primeiro.date() <= hoje + timedelta(days=45)
    assert primeiro.weekday() < 5
    assert primeiro.date() not in service.feriados_do_ano([primeiro.year])
    assert segundo - primeiro == timedelta(days=7)


async def test_criar_leilao_sem_data_usa_sugestao(
    cliente_logado: AsyncClient, processo_analisado: Processo
) -> None:
    resposta = await cliente_logado.post(
        "/api/agenda/leiloes", json={"processo_id": str(processo_analisado.id)}
    )
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert corpo["status"] == "agendado"
    assert corpo["numero_processo"] == "1003966-15.2022.4.01.4301"
    assert corpo["edital_id"] is None
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    assert detalhe["leilao"]["id"] == corpo["id"]


async def test_criar_leilao_duplicado_409(
    cliente_logado: AsyncClient, processo_analisado: Processo
) -> None:
    corpo = {"processo_id": str(processo_analisado.id)}
    assert (await cliente_logado.post("/api/agenda/leiloes", json=corpo)).status_code == 201
    resposta = await cliente_logado.post("/api/agenda/leiloes", json=corpo)
    assert resposta.status_code == 409
    assert resposta.json() == {"detail": "Processo já tem leilão agendado"}


async def test_criar_leilao_processo_nao_analisado_409(cliente_logado: AsyncClient) -> None:
    from tests.fixtures import TEXTO_PROCESSO, make_pdf

    upload = await cliente_logado.post(
        "/api/processos", files={"arquivo": ("p.pdf", make_pdf(TEXTO_PROCESSO), "application/pdf")}
    )
    resposta = await cliente_logado.post(
        "/api/agenda/leiloes", json={"processo_id": upload.json()["id"]}
    )
    assert resposta.status_code == 409
    assert resposta.json() == {"detail": "Processo precisa estar analisado"}


async def test_criar_leilao_processo_inexistente_404(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.post("/api/agenda/leiloes", json={"processo_id": str(uuid4())})
    assert resposta.status_code == 404


async def test_criar_leilao_data_em_formato_invalido_422(
    cliente_logado: AsyncClient, processo_analisado: Processo
) -> None:
    resposta = await cliente_logado.post(
        "/api/agenda/leiloes",
        json={"processo_id": str(processo_analisado.id), "primeiro_leilao_data": "03/11/2026"},
    )
    assert resposta.status_code == 422


async def test_cancelar_muda_status_e_libera_processo(
    cliente_logado: AsyncClient, leilao_agendado: Leilao
) -> None:
    resposta = await cliente_logado.delete(f"/api/agenda/leiloes/{leilao_agendado.id}")
    assert resposta.status_code == 204
    lista = (await cliente_logado.get("/api/agenda/leiloes")).json()
    assert [item["status"] for item in lista if item["id"] == str(leilao_agendado.id)] == [
        "cancelado"
    ]
    detalhe = (await cliente_logado.get(f"/api/processos/{leilao_agendado.processo_id}")).json()
    assert detalhe["leilao"] is None


async def test_operador_nao_cancela_leilao_403(
    cliente_operador: AsyncClient, leilao_agendado: Leilao
) -> None:
    resposta = await cliente_operador.delete(f"/api/agenda/leiloes/{leilao_agendado.id}")
    assert resposta.status_code == 403
    assert resposta.json() == {"detail": "Sem permissão"}
    lista = (await cliente_operador.get("/api/agenda/leiloes")).json()
    assert [item["status"] for item in lista if item["id"] == str(leilao_agendado.id)] == [
        "agendado"
    ]


async def test_listar_filtra_por_intervalo(
    cliente_logado: AsyncClient, leilao_agendado: Leilao, settings_teste: Settings
) -> None:
    dia = local(leilao_agendado.primeiro_leilao_em, settings_teste).date()
    dentro = await cliente_logado.get(
        "/api/agenda/leiloes", params={"inicio": dia.isoformat(), "fim": dia.isoformat()}
    )
    assert [item["id"] for item in dentro.json()] == [str(leilao_agendado.id)]
    antes = await cliente_logado.get(
        "/api/agenda/leiloes",
        params={
            "inicio": (dia - timedelta(days=20)).isoformat(),
            "fim": (dia - timedelta(days=10)).isoformat(),
        },
    )
    assert antes.json() == []


async def test_bloqueios_crud(cliente_logado: AsyncClient) -> None:
    criado = await cliente_logado.post(
        "/api/agenda/bloqueios", json={"data": "2026-12-28", "motivo": "Recesso"}
    )
    assert criado.status_code == 201
    assert criado.json()["motivo"] == "Recesso"
    duplicado = await cliente_logado.post(
        "/api/agenda/bloqueios", json={"data": "2026-12-28", "motivo": "x"}
    )
    assert duplicado.status_code == 409
    assert duplicado.json() == {"detail": "Data já bloqueada"}
    lista = (await cliente_logado.get("/api/agenda/bloqueios")).json()
    assert [b["data"] for b in lista] == ["2026-12-28"]
    assert (
        await cliente_logado.delete(f"/api/agenda/bloqueios/{criado.json()['id']}")
    ).status_code == 204
    assert (await cliente_logado.delete(f"/api/agenda/bloqueios/{uuid4()}")).status_code == 404
    assert (await cliente_logado.get("/api/agenda/bloqueios")).json() == []


async def test_operador_le_mas_nao_gerencia_bloqueios(
    cliente_logado: AsyncClient, cliente_operador: AsyncClient
) -> None:
    criado = (
        await cliente_logado.post(
            "/api/agenda/bloqueios", json={"data": "2026-12-28", "motivo": "Recesso"}
        )
    ).json()
    assert (await cliente_operador.get("/api/agenda/bloqueios")).status_code == 200
    negado = await cliente_operador.post(
        "/api/agenda/bloqueios", json={"data": "2026-12-29", "motivo": "x"}
    )
    assert negado.status_code == 403
    assert negado.json() == {"detail": "Sem permissão"}
    assert (
        await cliente_operador.delete(f"/api/agenda/bloqueios/{criado['id']}")
    ).status_code == 403


async def test_feriados_endpoint_devolve_br_e_pa_ordenados(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.get("/api/agenda/feriados", params={"ano": 2026})
    assert resposta.status_code == 200
    datas = [f["data"] for f in resposta.json()]
    assert datas == sorted(datas)
    assert "2026-08-15" in datas
    assert "2026-11-02" in datas
    assert "2026-11-20" in datas
    assert all(set(f) == {"data", "motivo"} and f["motivo"] for f in resposta.json())
    sem_ano = await cliente_logado.get("/api/agenda/feriados")
    assert sem_ano.status_code == 200
    assert len(sem_ano.json()) > 0


async def test_corrida_no_agendamento_vira_409(
    session: AsyncSession,
    settings_teste: Settings,
    processo_analisado: Processo,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _sem_leilao(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr(service, "leilao_ativo", _sem_leilao)
    dados = LeilaoCreate(processo_id=processo_analisado.id)
    await service.criar_leilao(session, settings_teste, dados, HOJE)
    with pytest.raises(ErroDominio) as excinfo:
        await service.criar_leilao(session, settings_teste, dados, HOJE)
    assert excinfo.value.status == 409
    assert excinfo.value.detail == "Processo já tem leilão agendado"
