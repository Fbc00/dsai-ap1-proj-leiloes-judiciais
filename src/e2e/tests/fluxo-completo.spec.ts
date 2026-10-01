import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const USUARIO = process.env.E2E_USUARIO ?? 'admin'
const SENHA = process.env.E2E_SENHA ?? 'admin12345'
const NUMERO_PROCESSO = '1003966-15.2022.4.01.4301'
const JUIZ = 'CLAUDIO CEZAR CAVALCANTES'
const DESTINATARIO = 'marketing@exemplo.com.br'
const PDF = path.join(__dirname, '..', 'fixtures', 'processo.pdf')

test('fluxo completo: login → upload → análise → agenda → edital → marketing', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuário').fill(USUARIO)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible()

  const nomeArquivo = `e2e-${Date.now()}.pdf`
  await page.getByLabel('Arquivo PDF do processo').setInputFiles({
    name: nomeArquivo,
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(PDF),
  })
  await page.getByRole('link', { name: nomeArquivo }).click()
  await expect(page.getByRole('heading', { name: nomeArquivo })).toBeVisible()

  await page.getByRole('button', { name: 'Analisar' }).click()
  await expect(page.getByText(`Processo nº ${NUMERO_PROCESSO}`)).toBeVisible()
  await expect(page.getByText('6.351').first()).toBeVisible()

  await page.getByRole('button', { name: 'Agendar' }).click()
  await expect(page.getByText('1º leilão', { exact: true })).toBeVisible()
  await expect(page.getByText('2º leilão', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Gerar edital' }).click()
  await expect(page.getByLabel('Conteúdo do edital')).toContainText(JUIZ)

  await page.getByRole('button', { name: 'Enviar pra marketing' }).click()
  await expect(page.getByText(`Enviado para ${DESTINATARIO}`)).toBeVisible()

  await page.getByRole('link', { name: 'Marketing' }).click()
  await expect(page.getByRole('cell', { name: NUMERO_PROCESSO }).first()).toBeVisible()
  await expect(page.getByText('enviado').first()).toBeVisible()
})
