import { Component, ErrorInfo, ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Renderizado no lugar dos filhos se eles quebrarem. Padrão: nada (some). */
  fallback?: ReactNode
  /** Rótulo pra identificar a origem no console. */
  rotulo?: string
}

type State = { erro: boolean }

// Isola um pedaço NÃO-crítico da UI para que um erro de render dele não derrube
// o app inteiro (white-screen). Por padrão o trecho some silenciosamente; o erro
// vai pro console pra diagnóstico. Use em volta de widgets opcionais (ex.: o
// assistente de IA), não em volta de fluxos essenciais.
class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: false }

  static getDerivedStateFromError(): State {
    return { erro: true }
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    const origem = this.props.rotulo ? ` ${this.props.rotulo}` : ''
    console.error(`[ErrorBoundary${origem}]`, erro, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.erro) return this.props.fallback ?? null
    return this.props.children
  }
}

export default ErrorBoundary
