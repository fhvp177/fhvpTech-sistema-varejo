import { useEffect, useRef, type ComponentType, type CSSProperties } from 'react'

/**
 * A ilha de navegação do celular, com a pílula que escorrega entre as abas.
 *
 * Segue a receita do `docs/roteiro-mobile.md`, §3. Os porquês abaixo são dele,
 * e cada um é um erro que já foi cometido e corrigido — não são preferências.
 *
 * ── As quatro decisões que fazem isto funcionar ──────────────────────────────
 *
 * **(a) A pílula é IRMÃ das abas, e vem ANTES delas no DOM.**
 * Fundo de link não escorrega: ele acende aqui e apaga ali. O que se anima é
 * POSIÇÃO, e posição só existe num elemento próprio. E, dentro do link, a
 * pílula ficaria presa ao contexto de empilhamento dele: como a aba ativa pode
 * ser a última da fileira, ela passava POR CIMA e apagava o ícone e o rótulo
 * de cada aba que atravessava. Fora, e primeiro, ela passa por baixo.
 *
 * **(b) A célula vem do `--i`, e não há conta de pixel em lugar nenhum.**
 * A pílula ocupa a MESMA célula de grade da aba ativa. De graça: ela tem
 * exatamente a largura da aba, sempre; se o rótulo crescer, ela acompanha.
 *
 * **(c) As colunas são `1fr`, não `minmax(0,1fr)`.**
 * Um rótulo longo faz a coluna crescer alguns pixels e as outras cedem. Forçar
 * todas iguais espremeria esse rótulo contra o vizinho, e isso é lido o dia
 * inteiro. O custo é só o primeiro quadro da animação partir de alguns pixels
 * fora do lugar; a chegada é sempre exata, porque o fim é `translate` zero.
 *
 * **(d) Quem rola precisa reservar a altura dela.** `fixed` faz a barra estar
 * sempre visível; o respiro embaixo faz o CONTEÚDO terminar acima dela. Faltando
 * o primeiro, você rola até o fim para achar a barra; faltando o segundo, a
 * última linha da lista fica escondida embaixo dela para sempre.
 *
 * ⚠️ No roteiro esse respiro é `padding-bottom` no `body`. Aqui o `body` não
 * rola: a casca é `h-screen` com `overflow-hidden` e quem rola é o `<main>`.
 * A regra é a mesma, aplicada a quem de fato rola — ver `.tem-ilha` no
 * index.css.
 */
export type ItemBarraInferior = {
  /** Identificador estável, usado como chave e nos testes. */
  id: string
  /** Palavra curta. Duas linhas de rótulo quebram o alinhamento da fileira. */
  rotulo: string
  icone: ComponentType<{ className?: string }>
  ativo: boolean
  aoTocar: () => void
}

export function BarraInferiorMobile({ itens }: { itens: ItemBarraInferior[] }) {
  const atual = itens.findIndex((i) => i.ativo)

  /*
   * Durante a renderização este ref ainda guarda a aba ANTERIOR: o efeito só
   * roda depois. É exatamente disso que a animação precisa para saber quantas
   * casas a pílula tem que viajar.
   *
   * `casas` é quantas posições ATRÁS ficou a aba anterior. Zero quando não se
   * veio de outra aba (primeira abertura, login, endereço digitado) — e aí a
   * pílula simplesmente aparece no lugar, sem viagem nenhuma.
   */
  const anterior = useRef(atual)
  const casas = anterior.current >= 0 && atual >= 0 ? anterior.current - atual : 0
  useEffect(() => {
    anterior.current = atual
  }, [atual])

  if (itens.length === 0) return null

  return (
    <nav
      className="ilha-abas"
      aria-label="Seções"
      data-n={itens.length}
      style={{ '--n': itens.length } as CSSProperties}
    >
      {/*
        `key={atual}` força o React a recriar o nó, e é isso que faz a animação
        do CSS TOCAR DE NOVO a cada troca de aba. Sem a key ela roda uma vez só,
        na montagem, e nunca mais.
      */}
      {atual >= 0 && (
        <span
          key={atual}
          className="ilha-pilula"
          aria-hidden="true"
          style={{ '--i': atual + 1, '--aba-de': casas } as CSSProperties}
        />
      )}

      {itens.map((item, i) => {
        const Icone = item.icone
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.aoTocar}
            className="ilha-aba"
            style={{ '--i': i + 1 } as CSSProperties}
            aria-current={item.ativo ? 'page' : undefined}
          >
            <Icone aria-hidden="true" />
            {item.rotulo}
          </button>
        )
      })}
    </nav>
  )
}
