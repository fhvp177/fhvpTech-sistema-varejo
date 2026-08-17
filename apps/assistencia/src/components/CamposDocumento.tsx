import { FC } from 'react'
import { IMaskInput } from 'react-imask'

/**
 * Campos de documento com máscara — CPF/CNPJ e RG.
 *
 * ── Por que isto é um componente, e não uma máscara copiada em cada tela ─────
 * Campo com formato tem máscara: se o dado tem forma, o campo impõe a forma e
 * recusa o resto. É regra da casa, e ela já foi quebrada uma vez justamente por
 * ser reimplementada tela a tela — a tela de Recibos nasceu com quatro campos de
 * documento aceitando qualquer letra e qualquer tamanho. Aqui a regra mora num
 * lugar só, e a próxima tela que precisar de CPF importa em vez de reinventar.
 *
 * A máscara vem do `IMaskInput` (react-imask), e não de um `onChange` que
 * reescreve o valor, por um motivo prático: o IMask **preserva a posição do
 * cursor**. Reformatar na mão joga o cursor para o fim a cada tecla, e corrigir
 * um dígito no meio do número vira briga.
 */

const CLASSE = [
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
  'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50'
].join(' ')

type Props = {
  id?: string
  value: string
  onChange: (valor: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * CPF **ou** CNPJ no mesmo campo.
 *
 * A máscara troca sozinha conforme o tamanho: até 11 dígitos formata como CPF,
 * do 12º em diante vira CNPJ. Perguntar antes "é pessoa física ou jurídica?"
 * seria uma pergunta a mais para uma informação que o próprio número já dá — e
 * num recibo, quem está atendendo tem alguém na frente esperando.
 *
 * (No cadastro de Clientes a separação existe e faz sentido: lá o tipo de pessoa
 * muda o formulário inteiro, não só a máscara.)
 */
export const CampoCpfCnpj: FC<Props> = ({ id, value, onChange, placeholder, disabled }) => (
  <IMaskInput
    id={id}
    mask={[{ mask: '000.000.000-00', maxLength: 11 }, { mask: '00.000.000/0000-00' }]}
    dispatch={(acrescentado, mascaraDinamica) => {
      const digitos = (mascaraDinamica.value + acrescentado).replace(/\D/g, '')
      return mascaraDinamica.compiledMasks[digitos.length > 11 ? 1 : 0]
    }}
    value={value}
    onAccept={(v: string) => onChange(v)}
    placeholder={placeholder ?? '000.000.000-00'}
    disabled={disabled}
    inputMode="numeric"
    className={CLASSE}
  />
)

/**
 * RG.
 *
 * ── Por que aqui NÃO há pontos nem tamanho fixo ──────────────────────────────
 * RG não tem formato nacional: cada estado emite o seu. São Paulo usa
 * 00.000.000-X (com dígito verificador que pode ser a letra X), o Rio termina em
 * número, Minas começa com as letras do estado, e a quantidade de dígitos varia
 * de sete a dez. Uma máscara fixa recusaria RG legítimo — e um campo que recusa
 * o documento verdadeiro do cliente é pior que um campo solto.
 *
 * O que dá para impor sem errar, e é o que este campo faz: **só dígitos**, com
 * um X final opcional (o único caractere não numérico que de fato aparece), e
 * um teto de tamanho. Ou seja, a queixa original — "digita quantos números
 * quiser e até letras" — some, sem inventar um formato que não existe.
 */
export const CampoRg: FC<Props> = ({ id, value, onChange, placeholder, disabled }) => (
  <IMaskInput
    id={id}
    // Até 12 dígitos, opcionalmente terminados em X. O `{0,12}` é o teto; o
    // `[xX]?` é o dígito verificador de São Paulo, que é letra.
    mask={/^[0-9]{0,12}[xX]?$/}
    prepare={(entrada: string) => entrada.toUpperCase()}
    value={value}
    onAccept={(v: string) => onChange(v)}
    placeholder={placeholder ?? 'Somente números (X no fim, se houver)'}
    disabled={disabled}
    className={CLASSE}
  />
)
