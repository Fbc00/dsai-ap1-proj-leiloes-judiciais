from datetime import time
from functools import lru_cache
from pathlib import Path
from typing import Literal, Self
from zoneinfo import ZoneInfo

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

HOSTS_LOCAIS: frozenset[str] = frozenset({"postgres", "localhost", "127.0.0.1"})
SSL_SEGURO: frozenset[str] = frozenset({"require", "verify-ca", "verify-full"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    APP_ENV: Literal["dev", "prod", "test"] = "dev"
    LOG_LEVEL: str = "INFO"
    DATABASE_URL: str
    DATABASE_URL_MIGRATOR: str
    DATABASE_URL_TEST: str = ""

    COOKIE_SECURE: bool = False
    TRUST_PROXY: bool = True
    SESSION_TTL_HOURS: int = 12
    LOGIN_MAX_TENTATIVAS: int = 5
    LOGIN_JANELA_MIN: int = 15

    MEDIA_ROOT: Path = Path("/data/media")
    MAX_UPLOAD_MB: int = 50
    TIMEZONE: str = "America/Belem"
    HORARIO_LEILAO: str = "10:00"

    LLM_PROVIDER: Literal["fake", "anthropic"] = "fake"
    ANTHROPIC_API_KEY: SecretStr = SecretStr("")
    ANTHROPIC_MODEL: str = "claude-opus-5-5"
    LLM_MAX_CHARS: int = 600_000

    LEILOEIRO_NOME: str = "Sandro de Oliveira"
    LEILOEIRO_JUCEPA: str = "20070555214"
    LEILOEIRO_SITE: str = "www.norteleiloes.com.br"
    LEILOEIRO_TELEFONE: str = "(91) 99125-0028"

    EMAIL_BACKEND: Literal["file", "smtp"] = "file"
    EMAIL_FROM: str = "leiloes@exemplo.com.br"
    MARKETING_EMAILS: str = "marketing@exemplo.com.br"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: SecretStr = SecretStr("")
    SMTP_TLS: bool = True

    @model_validator(mode="after")
    def exige_ssl_fora_do_local(self) -> Self:
        urls: dict[str, str] = {
            "DATABASE_URL": self.DATABASE_URL,
            "DATABASE_URL_MIGRATOR": self.DATABASE_URL_MIGRATOR,
            "DATABASE_URL_TEST": self.DATABASE_URL_TEST,
        }
        for nome, valor in urls.items():
            if not valor:
                continue
            url = make_url(valor)
            if url.host is None or url.host in HOSTS_LOCAIS:
                continue
            if "sslmode" in url.query:
                raise ValueError(f"{nome}: use ?ssl=require (asyncpg), não sslmode")
            if url.query.get("ssl") not in SSL_SEGURO:
                raise ValueError(f"{nome} precisa de ?ssl=require fora do Postgres local")
        return self

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.TIMEZONE)

    @property
    def horario_leilao(self) -> time:
        horas, minutos = self.HORARIO_LEILAO.split(":")
        return time(hour=int(horas), minute=int(minutos))

    @property
    def marketing_emails(self) -> list[str]:
        return [e.strip() for e in self.MARKETING_EMAILS.split(",") if e.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
