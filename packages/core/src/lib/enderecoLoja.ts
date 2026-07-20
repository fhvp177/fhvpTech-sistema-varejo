// Endereço da loja em partes (logradouro, número, bairro…) e a linha única que
// aparece impressa.
//
// Mora no core, e não no app, por um motivo de correção — não de reuso: a
// migration que converte o endereço antigo (texto livre) para as partes roda no
// processo main, e o cupom que imprime roda no renderer. Os dois PRECISAM usar
// a mesma função de formatação, senão a garantia da migration ("o cupom
// continua idêntico ao que era") vira promessa vazia. Como `electron/` não
// importa de `src/`, o único lugar que os dois enxergam é aqui.
//
// Por que decompor: a emissão de nota fiscal exige logradouro, número e bairro
// como campos separados e obrigatórios (a ACBr recusa o cadastro do emitente
// sem eles). Até aqui o sistema guardava tudo numa string só, porque o cupom
// só precisava imprimir.

export type PartesEndereco = {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
}

export const ENDERECO_VAZIO: PartesEndereco = {
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: ''
}

const limpar = (v: string | null | undefined) => (v ?? '').trim()

// Monta a linha impressa a partir das partes. Formato:
//   "Logradouro, 123 - Complemento - Bairro"
// Cada pedaço só entra se estiver preenchido — loja sem bairro não imprime
// travessão solto.
export function formatarEnderecoLoja(partes: Partial<PartesEndereco>): string {
  const logradouro = limpar(partes.logradouro)
  const numero = limpar(partes.numero)
  const complemento = limpar(partes.complemento)
  const bairro = limpar(partes.bairro)

  if (!logradouro) return ''

  const inicio = numero ? `${logradouro}, ${numero}` : logradouro
  return [inicio, complemento, bairro].filter(Boolean).join(' - ')
}

// Um pedaço é "número" se for só dígitos (com letra opcional: 12A) ou uma das
// formas de "sem número". Essa exigência é o que impede partir
// "Rua Coronel, Silva" e virar número "Silva".
const EH_NUMERO = /^(\d+\s*[a-zA-Z]?|s\/?n\.?º?|sem\s+n[uú]mero)$/i

// Tenta separar um endereço escrito à mão nas partes. É palpite, não verdade:
// endereço brasileiro não tem formato único e o mesmo texto pode ser lido de
// várias formas. Por isso o resultado é SUGESTÃO — quem chama decide o que
// fazer com ela, e usa `separacaoConfiavel` pra saber se pode confiar a ponto
// de trocar o que já é impresso.
//
// Formatos reconhecidos (os que os lojistas de fato digitam):
//   "Rua X, 123 - Centro"       → logradouro, numero, bairro
//   "Rua X, 123, Centro"        → idem
//   "Rua X - Centro"            → logradouro, bairro (sem número)
//   "Rua X, 123"                → logradouro, numero
//   "Rua X 123"                 → logradouro, numero
//   "Rua X"                     → só logradouro
//   "Av. Y, 500 - Sala 3 - Jd"  → logradouro, numero, complemento, bairro
export function separarEnderecoLegado(texto: string): PartesEndereco {
  const original = limpar(texto)
  if (!original) return { ...ENDERECO_VAZIO }

  // Primeiro corta por " - ", o separador mais comum de bairro/complemento.
  const blocos = original
    .split(/\s+-\s+/)
    .map((b) => b.trim())
    .filter(Boolean)

  const cabeca = blocos[0] ?? ''
  const resto = blocos.slice(1)

  let complemento = ''
  let bairro = ''
  if (resto.length === 1) {
    bairro = resto[0]
  } else if (resto.length > 1) {
    // Por convenção de escrita, o bairro é sempre o último pedaço.
    bairro = resto[resto.length - 1]
    complemento = resto.slice(0, -1).join(' - ')
  }

  // Dentro da cabeça, tenta pela vírgula: "Rua X, 123" ou "Rua X, 123, Centro".
  const porVirgula = cabeca
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  let logradouro = cabeca
  let numero = ''

  if (porVirgula.length >= 2 && EH_NUMERO.test(porVirgula[1])) {
    logradouro = porVirgula[0]
    numero = porVirgula[1].replace(/\s+/g, '')
    // Sobrou coisa depois do número e ainda não temos bairro? É o bairro.
    if (porVirgula.length > 2 && !bairro) {
      bairro = porVirgula.slice(2).join(', ')
    }
  } else {
    // Sem vírgula útil, tenta número solto no fim: "Rua X 123".
    const m = cabeca.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)$/)
    if (m && m[1].trim()) {
      logradouro = m[1].trim()
      numero = m[2].replace(/\s+/g, '')
    }
  }

  return { logradouro, numero, complemento, bairro }
}

// A trava de segurança da conversão: só considera a separação confiável se
// remontar EXATAMENTE o texto original. Se não bater, a migration mantém o
// texto antigo intocado e deixa o lojista preencher — antes um campo pra
// preencher do que um endereço errado impresso no cupom (ou, pior, numa nota
// fiscal, onde vira problema com o Fisco).
//
// A comparação normaliza só espaço em excesso, nunca conteúdo.
export function separacaoConfiavel(original: string, partes: PartesEndereco): boolean {
  const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim()
  const remontado = formatarEnderecoLoja(partes)
  if (!remontado) return false
  return normalizar(remontado) === normalizar(original)
}
