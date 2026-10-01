import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Explode(): never {
  throw new Error('quebrou')
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mostra mensagem amigável quando um filho lança', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado. Recarregue a página.')
  })

  it('renderiza filhos normalmente sem erro', () => {
    render(
      <ErrorBoundary>
        <p>tudo certo</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('tudo certo')).toBeInTheDocument()
  })
})
