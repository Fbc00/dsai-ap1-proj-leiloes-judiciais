from httpx import AsyncClient


async def test_health_responde_ok(cliente: AsyncClient) -> None:
    resposta = await cliente.get("/api/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


async def test_erro_nao_tratado_vira_500_sem_stack(cliente: AsyncClient) -> None:
    resposta = await cliente.get("/api/_boom")
    assert resposta.status_code == 500
    assert resposta.json() == {"detail": "Erro interno"}
    assert "segredo-interno" not in resposta.text
