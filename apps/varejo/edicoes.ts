/**
 * Edições do build — quais funcionalidades entram no bundle de cada plano.
 *
 * As flags viram constantes literais (`define`), então o bundler faz dead-code
 * elimination das desligadas: o código E suas libs exclusivas somem do binário
 * daquela edição (não ficam só escondidos). Cada edição é gerada com a env
 * EDICAO.
 *
 * Planos comerciais (definidos 2026-07-17): 'basico' = tudo que o sistema tem
 * hoje; 'pro' = basico + nota fiscal (nfe) + TEF. Default 'pro' = tudo ligado
 * (dev e build padrão, sem regressão).
 *
 * ⚠️ `pagamento` NÃO é flag de plano — é TAPUME DE OBRA. As outras respondem
 * "esta edição vendeu isso?"; esta responde "isto já está pronto pro lojista
 * ver?". Fica `false` em TODAS as edições, inclusive na 'pro', enquanto a
 * maquininha integrada estiver sendo construída. Quando terminar, ela some e o
 * gate passa a ser só `tef`, que é a flag comercial de verdade.
 *
 * ── Por que num arquivo só ───────────────────────────────────────────────────
 * Dois builds consomem esta tabela: o do app instalado
 * (`electron.vite.config.ts`) e o do navegador (`vite.web.config.ts`). Copiada
 * nos dois, uma edição nova entraria em um e faltaria no outro — e o efeito de
 * flag ausente não é erro de compilação, é `undefined` no meio de um `if`: a
 * funcionalidade some da tela sem aviso nenhum.
 */
export type Features = Record<
  'dashboard' | 'chatbot' | 'etiquetas' | 'tef' | 'nfe' | 'multicaixa' | 'pagamento',
  boolean
>

export const FEATURES_POR_EDICAO: Record<string, Features> = {
  basico: {
    dashboard: true,
    chatbot: true,
    etiquetas: true,
    tef: false,
    nfe: false,
    multicaixa: false,
    pagamento: false
  },
  // pagamento fica false aqui TAMBÉM, de propósito — ver o comentário acima.
  pro: {
    dashboard: true,
    chatbot: true,
    etiquetas: true,
    tef: true,
    nfe: true,
    multicaixa: true,
    pagamento: false
  }
}
