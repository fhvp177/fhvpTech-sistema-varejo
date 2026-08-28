import type { FC, ReactNode } from 'react'
import './animacoes.css'

/**
 * O que aparece quando a lista não tem nada.
 *
 * ── Por que um componente, e não uma frase em cada tela ──────────────────────
 * Antes cada tela escrevia a sua: uma linha de texto cinza no meio de uma tabela
 * vazia. Funciona, mas é o momento em que a pessoa MAIS precisa de ajuda — ou
 * ela acabou de instalar o sistema e não sabe por onde começar, ou ela filtrou
 * algo e não achou. Uma frase solta no vazio não distingue os dois casos nem dá
 * onde descansar o olho.
 *
 * ── Por que o ícone flutua ───────────────────────────────────────────────────
 * Tela vazia é a única da lista em que movimento contínuo não atrapalha: não há
 * nada para ler, nada para conferir, ninguém está no meio de uma tarefa. A
 * flutuação lenta (2,2s por ciclo, 5px) dá um ponto de repouso e sinaliza que o
 * sistema está vivo, e não travado — que é a leitura errada mais comum de uma
 * tela sem conteúdo.
 *
 * Em qualquer OUTRA tela isso seria ruído. Aqui é a exceção que se paga.
 */
export const EstadoVazio: FC<{
  /** Ícone da entidade que falta — produto, cliente, conta. Tamanho livre. */
  icone: ReactNode
  /** A frase principal. */
  children: ReactNode
  /** Linha menor embaixo: o que fazer a seguir, quando houver. */
  dica?: ReactNode
}> = ({ icone, children, dica }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
    <span className="anim-flutua opacity-35">{icone}</span>
    <p className="text-sm">{children}</p>
    {dica && <p className="text-xs opacity-70">{dica}</p>}
  </div>
)

export default EstadoVazio
