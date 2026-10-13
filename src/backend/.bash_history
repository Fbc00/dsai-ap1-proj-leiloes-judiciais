 uv run python -m app.cli criar-usuario admin --nome "Admin" --perfil admin
uv run python -c   'import getpass; from app.security.passwords import hash_senha; print(hash_senha(getpass.getpass("Senha: ")))'
exit
