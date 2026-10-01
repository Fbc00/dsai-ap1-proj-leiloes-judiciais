from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Perfil = Literal["admin", "operador"]
SENHA_MINIMA: int = 8


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class SenhaIn(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=200)
    nova_senha: str = Field(min_length=SENHA_MINIMA, max_length=200)


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    nome: str
    perfil: Perfil
    ativo: bool


class UsuarioCreate(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    nome: str = Field(min_length=1, max_length=200)
    perfil: Perfil
    senha: str = Field(min_length=SENHA_MINIMA, max_length=200)


class UsuarioUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    perfil: Perfil | None = None
    ativo: bool | None = None
    nova_senha: str | None = Field(default=None, min_length=SENHA_MINIMA, max_length=200)
