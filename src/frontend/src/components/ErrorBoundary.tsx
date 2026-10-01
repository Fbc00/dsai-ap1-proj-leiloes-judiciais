import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { quebrou: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { quebrou: false }

  static getDerivedStateFromError(): State {
    return { quebrou: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.quebrou) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800"
          >
            Algo deu errado. Recarregue a página.
          </p>
        </main>
      )
    }
    return this.props.children
  }
}
