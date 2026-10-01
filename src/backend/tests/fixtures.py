from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

TEXTO_PROCESSO: str = (
    "PROCESSO 1003966-15.2022.4.01.4301\n"
    "2ª Vara Federal Cível e Criminal da Comarca de Araguaína - TO\n"
    "Exequente: UNIÃO FEDERAL\n"
    "Executado citado por mandado (Id 1308225768)\n"
    "Penhora dos lotes matrículas 6.351 e 6.235 em 24/10/2025 (Id 2221536340)"
)


def make_pdf(texto: str) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    _, altura = A4
    y = altura - 72
    for linha in texto.splitlines() or [texto]:
        pdf.drawString(72, y, linha)
        y -= 14
        if y < 72:
            pdf.showPage()
            y = altura - 72
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def make_pdf_sem_texto() -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
