import { FC, useEffect } from 'react'
import { Select } from '@fhvptech/core/ui/select'
import { useContasDeEntrada } from '@/hooks/useContasDeEntrada'

/**
 * Em qual conta o dinheiro recebido entra.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Vamos precisar colocar na hora de receber o valor pago por uma venda, onde
 * aquele dinheiro dessa venda ou parcela vai entrar, em qual banco ele vai
 * entrar." (12/09/2026)
 *
 * Antes o sistema ADIVINHAVA, por uma escada de três degraus: a conta casada
 * com a forma de pagamento, senão a marcada como padrão de recebimento, senão
 * qualquer ativa. Numa loja com dois bancos recebendo PIX não havia como dizer
 * qual deles recebeu, e o saldo dos dois ficava errado ao mesmo tempo.
 *
 * ── ⚠️ Some quando a forma é DINHEIRO, e isso não é economia de tela ────────
 * A nota que o cliente entregou está fisicamente na gaveta daquele operador.
 * Oferecer a escolha ali seria oferecer uma coisa que o sistema vai recusar: a
 * trava está no banco (ver `destinoDoRecebimento`), e ele manda a espécie para
 * o caixa de qualquer jeito. Campo que aceita e não obedece é pior que campo
 * nenhum.
 *
 * Quem quiser levar espécie para o banco faz SANGRIA, que é o que ela é.
 */

type Props = {
  /** Forma de pagamento escolhida. 'dinheiro' esconde o seletor. */
  forma: string | null | undefined
  /** Id da conta, como texto (''=deixar o sistema decidir). */
  value: string
  onChange: (v: string) => void
  className?: string
  classNameContainer?: string
}

const SeletorContaEntrada: FC<Props> = ({
  forma,
  value,
  onChange,
  className,
  classNameContainer
}) => {
  const contas = useContasDeEntrada()
  const especie = (forma ?? '').toLowerCase() === 'dinheiro'

  /*
   * Trocar para dinheiro limpa a escolha. Sem isto, escolher "Banco X" para um
   * PIX e depois trocar a forma para dinheiro deixaria o Banco X guardado num
   * campo invisível — e ele voltaria sozinho ao trocar a forma de novo, sem
   * ninguém entender por quê.
   */
  useEffect(() => {
    if (especie && value) onChange('')
  }, [especie, value, onChange])

  // Loja com uma conta só não tem escolha a fazer: o seletor seria uma lista de
  // um item, ocupando espaço para não decidir nada.
  if (especie || contas.length < 2) return null

  return (
    <Select
      value={value}
      onChange={onChange}
      className={className}
      classNameContainer={classNameContainer}
      opcoes={[
        { valor: '', rotulo: 'Conta automática' },
        ...contas.map((c) => ({ valor: String(c.id), rotulo: c.nome }))
      ]}
    />
  )
}

export default SeletorContaEntrada
