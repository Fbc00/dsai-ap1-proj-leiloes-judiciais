import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path
from uuid import uuid4

from app.config import Settings

TIPO_XLSX: tuple[str, str] = (
    "application",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)


class EnvioEmailFalhou(Exception):
    pass


def montar_mensagem(
    settings: Settings,
    *,
    to: list[str],
    subject: str,
    body: str,
    attachment: tuple[str, bytes] | None,
) -> EmailMessage:
    mensagem = EmailMessage()
    mensagem["From"] = settings.EMAIL_FROM
    mensagem["To"] = ", ".join(to)
    mensagem["Subject"] = subject
    mensagem.set_content(body)
    if attachment is not None:
        nome, conteudo = attachment
        maintype, subtype = TIPO_XLSX
        mensagem.add_attachment(conteudo, maintype=maintype, subtype=subtype, filename=nome)
    return mensagem


def _enviar_smtp(settings: Settings, mensagem: EmailMessage) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
        if settings.SMTP_TLS:
            smtp.starttls(context=ssl.create_default_context())
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD.get_secret_value())
        smtp.send_message(mensagem)


def _gravar_arquivo(settings: Settings, mensagem: EmailMessage) -> Path:
    outbox = settings.MEDIA_ROOT / "outbox"
    outbox.mkdir(parents=True, exist_ok=True)
    destino = outbox / f"{uuid4()}.eml"
    destino.write_bytes(mensagem.as_bytes())
    return destino


async def send_email(
    settings: Settings,
    *,
    to: list[str],
    subject: str,
    body: str,
    attachment: tuple[str, bytes] | None,
) -> None:
    mensagem = montar_mensagem(settings, to=to, subject=subject, body=body, attachment=attachment)
    try:
        if settings.EMAIL_BACKEND == "smtp":
            await asyncio.to_thread(_enviar_smtp, settings, mensagem)
        else:
            await asyncio.to_thread(_gravar_arquivo, settings, mensagem)
    except (smtplib.SMTPException, OSError) as exc:
        raise EnvioEmailFalhou(str(exc)) from exc
