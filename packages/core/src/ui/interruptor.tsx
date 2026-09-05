import { type FC } from 'react'
import { cn } from '@fhvptech/core/lib/utils'

/**
 * Interruptor de liga/desliga.
 *
 * ── Por que ele existe ───────────────────────────────────────────────────────
 * Este controle era copiado à mão em nove lugares dos dois nichos, sempre as
 * mesmas dez classes. Além do custo de manter, a cópia esconde dois problemas
 * que só aparecem quando alguém olha o conjunto:
 *
 *  1. O dono olhou a tela e disse que estavam "muito redondos". Com o trilho e
 *     o botão os dois em `rounded-full`, o controle vira uma cápsula com uma
 *     bolinha dentro — a mesma forma do avatar do cliente e da pílula da ilha,
 *     que são outras coisas. Aqui o trilho é um retângulo de cantos suaves e o
 *     botão um quadradinho arredondado: continua óbvio que liga e desliga, e
 *     para de competir com as formas redondas do resto da tela.
 *
 *  2. ⚠️ O alvo tinha 24px de altura. O §7 do roteiro de mobile pede 44, e o
 *     dedo não acerta 24. Aqui o desenho continua com 24 e quem cresce é a
 *     ÁREA DE TOQUE, num pseudo-elemento que não ocupa espaço nenhum no
 *     layout — senão cada linha de configuração ganharia 20px de altura para
 *     nada.
 *
 * ── Sobre a cor ──────────────────────────────────────────────────────────────
 * Ligado usa `bg-primary`, que cada app remapeia no seu tailwind.config. Não
 * entra verde nem cor fixa: o mesmo componente nasce certo em cada loja.
 */

type Props = {
  ligado: boolean
  onAlternar: (novo: boolean) => void
  desabilitado?: boolean
  /** Obrigatório quando não há `<label>` em volta — o controle não tem texto. */
  rotulo?: string
  className?: string
}

export const Interruptor: FC<Props> = ({
  ligado,
  onAlternar,
  desabilitado = false,
  rotulo,
  className
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={ligado}
    aria-label={rotulo}
    disabled={desabilitado}
    onClick={() => onAlternar(!ligado)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-md p-0.5',
      'transition-colors duration-200 motion-reduce:transition-none',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-40',
      // ⚠️ A área de toque de 44px vive AQUI, num pseudo-elemento sem tamanho
      // no layout: 24 de altura + 10 acima + 10 abaixo. Aumentar o botão de
      // verdade engordaria todas as linhas de configuração em 20px.
      "after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']",
      ligado ? 'bg-primary' : 'bg-muted-foreground/30',
      className
    )}
  >
    <span
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-[4px] bg-white shadow-sm',
        'transition-transform duration-200 motion-reduce:transition-none',
        ligado ? 'translate-x-5' : 'translate-x-0'
      )}
    />
  </button>
)

export default Interruptor
