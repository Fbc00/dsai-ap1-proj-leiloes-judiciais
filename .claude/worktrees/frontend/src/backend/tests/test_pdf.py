from pathlib import Path

from app.pdf.extract import extract_text
from tests.fixtures import TEXTO_PROCESSO, make_pdf, make_pdf_sem_texto


def test_extrai_texto_de_pdf(tmp_path: Path) -> None:
    caminho = tmp_path / "processo.pdf"
    caminho.write_bytes(make_pdf(TEXTO_PROCESSO))
    texto = extract_text(caminho)
    assert "1003966-15.2022.4.01.4301" in texto
    assert "citado por mandado" in texto
    assert "Araguaína" in texto


def test_pdf_sem_texto_retorna_vazio(tmp_path: Path) -> None:
    caminho = tmp_path / "branco.pdf"
    caminho.write_bytes(make_pdf_sem_texto())
    assert extract_text(caminho) == ""


def test_normaliza_espacos_e_junta_paginas(tmp_path: Path) -> None:
    linhas = "\n".join(f"linha {i}" for i in range(60))
    caminho = tmp_path / "longo.pdf"
    caminho.write_bytes(make_pdf(linhas))
    texto = extract_text(caminho)
    assert "linha 0" in texto
    assert "linha 59" in texto
    assert "  " not in texto
    assert "\n\n\n" not in texto
