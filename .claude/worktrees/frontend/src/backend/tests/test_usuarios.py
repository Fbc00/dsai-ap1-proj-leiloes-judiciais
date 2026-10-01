from uuid import uuid4

from httpx import AsyncClient

from tests.conftest import OPERADOR_TESTE, USUARIO_TESTE

NOVO = {"username": "carla", "nome": "Carla Dias", "perfil": "operador", "senha": "senha-carla-123"}


async def _id_de(cliente: AsyncClient, username: str) -> str:
    usuarios = (await cliente.get("/api/usuarios")).json()
    return next(u["id"] for u in usuarios if u["username"] == username)


async def test_operador_em_rota_admin_403(cliente_operador: AsyncClient) -> None:
    resposta = await cliente_operador.get("/api/usuarios")
    assert resposta.status_code == 403
    assert resposta.json() == {"detail": "Sem permissão"}
    criar = await cliente_operador.post("/api/usuarios", json=NOVO)
    assert criar.status_code == 403
    assert criar.json() == {"detail": "Sem permissão"}


async def test_admin_lista_usuarios_em_ordem_de_username(
    cliente_logado: AsyncClient, cliente_operador: AsyncClient
) -> None:
    resposta = await cliente_logado.get("/api/usuarios")
    assert resposta.status_code == 200
    usernames = [u["username"] for u in resposta.json()]
    assert usernames == sorted(usernames)
    assert {USUARIO_TESTE["username"], OPERADOR_TESTE["username"]} <= set(usernames)
    assert all(set(u) == {"id", "username", "nome", "perfil", "ativo"} for u in resposta.json())


async def test_admin_cria_usuario_que_consegue_logar(
    cliente_logado: AsyncClient, cliente: AsyncClient
) -> None:
    resposta = await cliente_logado.post("/api/usuarios", json=NOVO)
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert corpo["username"] == "carla"
    assert corpo["perfil"] == "operador"
    assert corpo["ativo"] is True
    assert "senha" not in corpo and "senha_hash" not in corpo
    cliente.cookies.clear()
    login = await cliente.post(
        "/api/auth/login", json={"username": "carla", "password": NOVO["senha"]}
    )
    assert login.status_code == 200
    assert login.json()["perfil"] == "operador"


async def test_criar_usuario_duplicado_409(cliente_logado: AsyncClient) -> None:
    assert (await cliente_logado.post("/api/usuarios", json=NOVO)).status_code == 201
    resposta = await cliente_logado.post("/api/usuarios", json=NOVO)
    assert resposta.status_code == 409
    assert resposta.json() == {"detail": "Username já existe"}


async def test_criar_usuario_senha_curta_422(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.post("/api/usuarios", json={**NOVO, "senha": "1234567"})
    assert resposta.status_code == 422


async def test_admin_edita_nome_e_perfil(
    cliente_logado: AsyncClient, cliente_operador: AsyncClient
) -> None:
    alvo = await _id_de(cliente_logado, OPERADOR_TESTE["username"])
    resposta = await cliente_logado.patch(
        f"/api/usuarios/{alvo}", json={"nome": "Operador Sênior", "perfil": "admin"}
    )
    assert resposta.status_code == 200
    assert resposta.json()["nome"] == "Operador Sênior"
    assert resposta.json()["perfil"] == "admin"
    assert (await cliente_operador.get("/api/usuarios")).status_code == 200


async def test_admin_nao_altera_proprio_perfil_ou_status_409(cliente_logado: AsyncClient) -> None:
    eu = await _id_de(cliente_logado, USUARIO_TESTE["username"])
    rebaixar = await cliente_logado.patch(f"/api/usuarios/{eu}", json={"perfil": "operador"})
    assert rebaixar.status_code == 409
    assert rebaixar.json() == {"detail": "Não é possível alterar o próprio perfil ou status"}
    desativar = await cliente_logado.patch(f"/api/usuarios/{eu}", json={"ativo": False})
    assert desativar.status_code == 409
    renomear = await cliente_logado.patch(
        f"/api/usuarios/{eu}", json={"nome": "Admin Geral", "perfil": "admin"}
    )
    assert renomear.status_code == 200
    assert renomear.json()["nome"] == "Admin Geral"


async def test_desativar_invalida_sessao_e_impede_login(
    cliente_logado: AsyncClient, cliente_operador: AsyncClient, cliente: AsyncClient
) -> None:
    alvo = await _id_de(cliente_logado, OPERADOR_TESTE["username"])
    assert (await cliente_operador.get("/api/auth/me")).status_code == 200
    resposta = await cliente_logado.patch(f"/api/usuarios/{alvo}", json={"ativo": False})
    assert resposta.status_code == 200
    assert resposta.json()["ativo"] is False
    assert (await cliente_operador.get("/api/auth/me")).status_code == 401
    cliente.cookies.clear()
    login = await cliente.post(
        "/api/auth/login",
        json={"username": OPERADOR_TESTE["username"], "password": OPERADOR_TESTE["senha"]},
    )
    assert login.status_code == 401
    assert login.json() == {"detail": "Credenciais inválidas"}


async def test_redefinir_senha_invalida_sessao_do_alvo(
    cliente_logado: AsyncClient, cliente_operador: AsyncClient, cliente: AsyncClient
) -> None:
    alvo = await _id_de(cliente_logado, OPERADOR_TESTE["username"])
    resposta = await cliente_logado.patch(
        f"/api/usuarios/{alvo}", json={"nova_senha": "redefinida-789"}
    )
    assert resposta.status_code == 200
    assert (await cliente_operador.get("/api/auth/me")).status_code == 401
    assert (await cliente_logado.get("/api/auth/me")).status_code == 200
    cliente.cookies.clear()
    login = await cliente.post(
        "/api/auth/login",
        json={"username": OPERADOR_TESTE["username"], "password": "redefinida-789"},
    )
    assert login.status_code == 200


async def test_patch_usuario_inexistente_404(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.patch(f"/api/usuarios/{uuid4()}", json={"nome": "X"})
    assert resposta.status_code == 404
    assert resposta.json() == {"detail": "Usuário não encontrado"}
