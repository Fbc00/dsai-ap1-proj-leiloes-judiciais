import json
from pathlib import Path
from uuid import uuid4

from httpx import AsyncClient, Response

from app.agenda.models import Leilao
from app.config import Settings, get_settings
from app.llm import llm_client_dep
from app.llm.fake import FIXTURES_DIR, FakeLLMClient
from app.main import app
from app.processos.models import Processo
from tests.fixtures import TEXTO_PROCESSO, make_pdf, make_pdf_sem_texto

CHECKLIST_VAZIO: dict[str, object] = {
    "vara": None,
    "numero_processo": None,
    "juiz": None,
    "tipo_justica": None,
    "exequente": {"nome": "", "cpf_cnpj": None, "advogados": []},
    "executados": [],
    "execucao": {},
    "bens": [],
    "recursos": None,
    "observacoes_leilao": [],
}


async def upload(
    cliente: AsyncClient,
    conteudo: bytes | None = None,
    nome: str = "processo.pdf",
    content_type: str = "application/pdf",
) -> Response:
    corpo = conteudo if conteudo is not None else make_pdf(TEXTO_PROCESSO)
    return await cliente.post("/api/processos", files={"arquivo": (nome, corpo, content_type)})


async def test_upload_pdf_201_status_recebido(cliente_logado: AsyncClient) -> None:
    resposta = await upload(cliente_logado)
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["status"] == "recebido"
    assert corpo["nome_arquivo"] == "processo.pdf"
    assert corpo["numero_processo"] is None


async def test_upload_content_type_errado_415(cliente_logado: AsyncClient) -> None:
    resposta = await upload(
        cliente_logado, conteudo=b"texto", nome="a.txt", content_type="text/plain"
    )
    assert resposta.status_code == 415
    assert resposta.json() == {"detail": "Arquivo precisa ser PDF"}


async def test_upload_magic_bytes_errado_415(cliente_logado: AsyncClient) -> None:
    resposta = await upload(cliente_logado, conteudo=b"nao sou pdf", content_type="application/pdf")
    assert resposta.status_code == 415


async def test_upload_acima_do_limite_413(
    cliente_logado: AsyncClient, settings_teste: Settings
) -> None:
    app.dependency_overrides[get_settings] = lambda: settings_teste.model_copy(
        update={"MAX_UPLOAD_MB": 1}
    )
    grande = b"%PDF-1.4" + b"0" * (1024 * 1024 + 1)
    resposta = await upload(cliente_logado, conteudo=grande)
    assert resposta.status_code == 413
    assert resposta.json() == {"detail": "Arquivo acima de 1 MB"}


async def test_upload_sanitiza_nome_e_salva_por_uuid(
    cliente_logado: AsyncClient, settings_teste: Settings
) -> None:
    resposta = await upload(cliente_logado, nome="../../etc/passwd.pdf")
    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["nome_arquivo"] == "passwd.pdf"
    assert (settings_teste.MEDIA_ROOT / "processos" / f"{corpo['id']}.pdf").exists()
    assert not (settings_teste.MEDIA_ROOT / "processos" / "passwd.pdf").exists()


async def test_listar_ordena_mais_recente_primeiro(cliente_logado: AsyncClient) -> None:
    primeiro = (await upload(cliente_logado, nome="a.pdf")).json()["id"]
    segundo = (await upload(cliente_logado, nome="b.pdf")).json()["id"]
    resposta = await cliente_logado.get("/api/processos")
    assert resposta.status_code == 200
    ids = [p["id"] for p in resposta.json()]
    assert ids.index(segundo) < ids.index(primeiro)


async def test_detalhe_inexistente_404(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.get(f"/api/processos/{uuid4()}")
    assert resposta.status_code == 404
    assert resposta.json() == {"detail": "Processo não encontrado"}


async def test_analisar_preenche_checklist_e_relatorio(cliente_logado: AsyncClient) -> None:
    processo_id = (await upload(cliente_logado)).json()["id"]
    resposta = await cliente_logado.post(f"/api/processos/{processo_id}/analisar")
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["status"] == "analisado"
    assert corpo["analisado_em"] is not None
    assert corpo["numero_processo"] == "1003966-15.2022.4.01.4301"
    assert corpo["vara"].startswith("2ª Vara Federal")
    esperado = json.loads((FIXTURES_DIR / "Checklist.json").read_text(encoding="utf-8"))
    assert corpo["checklist"] == esperado
    assert len(corpo["relatorio"]["etapas"]) == 4
    assert corpo["leilao"] is None


async def test_analisar_pdf_sem_texto_422_e_status_erro(cliente_logado: AsyncClient) -> None:
    processo_id = (await upload(cliente_logado, conteudo=make_pdf_sem_texto())).json()["id"]
    resposta = await cliente_logado.post(f"/api/processos/{processo_id}/analisar")
    assert resposta.status_code == 422
    assert resposta.json() == {"detail": "PDF sem camada de texto"}
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_id}")).json()
    assert detalhe["status"] == "erro"
    assert detalhe["erro"] == "PDF sem camada de texto"


async def test_analisar_falha_do_llm_502_e_status_erro(
    cliente_logado: AsyncClient, tmp_path: Path
) -> None:
    app.dependency_overrides[llm_client_dep] = lambda: FakeLLMClient(tmp_path)
    processo_id = (await upload(cliente_logado)).json()["id"]
    resposta = await cliente_logado.post(f"/api/processos/{processo_id}/analisar")
    assert resposta.status_code == 502
    assert resposta.json() == {"detail": "Falha ao analisar processo"}
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_id}")).json()
    assert detalhe["status"] == "erro"


async def test_analisar_com_checklist_vazio_fica_analisado(
    cliente_logado: AsyncClient, tmp_path: Path
) -> None:
    (tmp_path / "Checklist.json").write_text(json.dumps(CHECKLIST_VAZIO), encoding="utf-8")
    (tmp_path / "Relatorio.json").write_text(
        '{"resumo": "Sem dados.", "etapas": []}', encoding="utf-8"
    )
    app.dependency_overrides[llm_client_dep] = lambda: FakeLLMClient(tmp_path)
    processo_id = (await upload(cliente_logado)).json()["id"]
    resposta = await cliente_logado.post(f"/api/processos/{processo_id}/analisar")
    assert resposta.status_code == 200
    assert resposta.json()["status"] == "analisado"
    assert resposta.json()["numero_processo"] is None
    assert resposta.json()["checklist"]["bens"] == []


async def test_put_checklist_atualiza_e_reflete_vara(
    cliente_logado: AsyncClient, processo_analisado: Processo
) -> None:
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    checklist = detalhe["checklist"]
    checklist["vara"] = "1ª Vara Cível de Belém/PA"
    resposta = await cliente_logado.put(
        f"/api/processos/{processo_analisado.id}/checklist", json=checklist
    )
    assert resposta.status_code == 200
    assert resposta.json()["vara"] == "1ª Vara Cível de Belém/PA"
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    assert detalhe["vara"] == "1ª Vara Cível de Belém/PA"


async def test_put_checklist_valor_com_virgula_422(
    cliente_logado: AsyncClient, processo_analisado: Processo
) -> None:
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    checklist = detalhe["checklist"]
    checklist["bens"][0]["valor_avaliacao"] = "1.234,56"
    resposta = await cliente_logado.put(
        f"/api/processos/{processo_analisado.id}/checklist", json=checklist
    )
    assert resposta.status_code == 422
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    assert detalhe["checklist"]["bens"][0]["valor_avaliacao"] == "120000.00"


async def test_delete_remove_arquivo_e_registro(
    cliente_logado: AsyncClient, settings_teste: Settings
) -> None:
    processo_id = (await upload(cliente_logado)).json()["id"]
    caminho = settings_teste.MEDIA_ROOT / "processos" / f"{processo_id}.pdf"
    assert caminho.exists()
    resposta = await cliente_logado.delete(f"/api/processos/{processo_id}")
    assert resposta.status_code == 204
    assert not caminho.exists()
    assert (await cliente_logado.get(f"/api/processos/{processo_id}")).status_code == 404


async def test_rotas_exigem_login(cliente: AsyncClient) -> None:
    assert (await cliente.get("/api/processos")).status_code == 401
    assert (await upload(cliente)).status_code == 403


async def test_operador_nao_apaga_processo_403(
    cliente_logado: AsyncClient, cliente_operador: AsyncClient
) -> None:
    processo_id = (await upload(cliente_logado)).json()["id"]
    resposta = await cliente_operador.delete(f"/api/processos/{processo_id}")
    assert resposta.status_code == 403
    assert resposta.json() == {"detail": "Sem permissão"}
    assert (await cliente_operador.get(f"/api/processos/{processo_id}")).status_code == 200


async def test_delete_processo_com_leilao_agendado_409(
    cliente_logado: AsyncClient, leilao_agendado: Leilao
) -> None:
    resposta = await cliente_logado.delete(f"/api/processos/{leilao_agendado.processo_id}")
    assert resposta.status_code == 409
    assert resposta.json() == {"detail": "Processo tem leilão agendado"}
    await cliente_logado.delete(f"/api/agenda/leiloes/{leilao_agendado.id}")
    assert (
        await cliente_logado.delete(f"/api/processos/{leilao_agendado.processo_id}")
    ).status_code == 204


async def test_analisar_pdf_corrompido_422_e_status_erro(cliente_logado: AsyncClient) -> None:
    processo_id = (await upload(cliente_logado, conteudo=b"%PDF-1.4 corrompido")).json()["id"]
    resposta = await cliente_logado.post(f"/api/processos/{processo_id}/analisar")
    assert resposta.status_code == 422
    assert resposta.json() == {"detail": "Não foi possível ler o PDF"}
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_id}")).json()
    assert detalhe["status"] == "erro"
    assert detalhe["erro"] == "Não foi possível ler o PDF"


async def test_put_checklist_numero_processo_longo_e_aceito(
    cliente_logado: AsyncClient, processo_analisado: Processo
) -> None:
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    checklist = detalhe["checklist"]
    longo = "1003966-15.2022.4.01.4301 (apenso 0001234-56.2021.8.14.0301, cumprimento de sentença)"
    checklist["numero_processo"] = longo
    resposta = await cliente_logado.put(
        f"/api/processos/{processo_analisado.id}/checklist", json=checklist
    )
    assert resposta.status_code == 200
    detalhe = (await cliente_logado.get(f"/api/processos/{processo_analisado.id}")).json()
    assert detalhe["numero_processo"] == longo
