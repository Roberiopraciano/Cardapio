import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Icon from './Icon'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Último anteparo antes da tela branca.
 * Qualquer erro de render em produção cai aqui e o cliente vê uma saída,
 * não um <div id="root"> vazio.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ background: 'var(--bg-page)' }}>
        <span className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: 'var(--bg-input)' }}>
          <Icon name="sad" size={32} color="var(--text-lo)" />
        </span>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>
          Algo deu errado
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
          Não conseguimos carregar o cardápio. Recarregue a página ou chame um atendente.
        </p>
        <button onClick={() => window.location.reload()}
          className="mt-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}>
          Recarregar
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-full overflow-auto text-left text-xs opacity-60">
            {this.state.error.message}
          </pre>
        )}
      </div>
    )
  }
}
