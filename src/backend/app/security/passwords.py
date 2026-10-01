from pwdlib import PasswordHash

_hasher: PasswordHash = PasswordHash.recommended()


def hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return _hasher.verify(senha, senha_hash)


HASH_DUMMY: str = hash_senha("dummy-para-tempo-constante")
