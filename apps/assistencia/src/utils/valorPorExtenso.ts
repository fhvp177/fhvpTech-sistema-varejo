/**
 * Valor em reais escrito por extenso.
 *
 * ── Por que isto merece um arquivo e uma bateria de testes ───────────────────
 * É a única parte do recibo que ninguém confere lendo. O número em algarismos
 * salta aos olhos; o extenso a pessoa bate o olho e assina. E é justamente ele
 * que, num documento de quitação, resolve a divergência: onde os dois discordam,
 * vale o que está escrito por extenso. Um erro aqui não parece um erro — parece
 * um recibo.
 *
 * Os pontos onde implementações caseiras erram, e que os testes vigiam:
 *   • 100 é "cem", 101 é "cento e um" — a mesma centena muda de nome;
 *   • 1.000.000 é "um milhão", mas 1.000 é "mil" (sem o "um");
 *   • o "e" separa dentro do grupo e some entre grupos: 1.234.567 é
 *     "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete";
 *   • centavos são um número à parte, com as MESMAS regras (0,71 → "setenta e
 *     um centavos"), e arredondar errado tira um centavo do papel.
 *
 * Escolha de estilo, para quem for mexer: usamos "mil quinhentos e trinta", a
 * forma padrão, e não "um mil e quinhentos e trinta", que aparece em alguns
 * geradores e em cheque. Se a preferência mudar, é uma linha em `grupoExtenso`.
 */

const UNIDADES = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove'
]

// 10 a 19 não seguem regra nenhuma: são nomes próprios.
const DEZ_A_DEZENOVE = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove'
]

const DEZENAS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa'
]

// Índice 1 é "cento", nunca "cem": "cem" é exclusivo do 100 exato, tratado à
// parte em `grupoExtenso`.
const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos'
]

/** Nome de cada casa de milhar, no singular e no plural. */
const ESCALAS: Array<{ singular: string; plural: string }> = [
  { singular: '', plural: '' },
  { singular: 'mil', plural: 'mil' },
  { singular: 'milhão', plural: 'milhões' },
  { singular: 'bilhão', plural: 'bilhões' },
  { singular: 'trilhão', plural: 'trilhões' }
]

/** O maior valor que sabemos escrever: 999 trilhões e o resto. */
export const TETO_EXTENSO = 1_000_000_000_000_000 - 1

/** Escreve um número de 1 a 999. */
function grupoExtenso(n: number): string {
  if (n === 100) return 'cem'

  const centena = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []

  if (centena > 0) partes.push(CENTENAS[centena])

  if (resto >= 10 && resto <= 19) {
    partes.push(DEZ_A_DEZENOVE[resto - 10])
  } else {
    const dezena = Math.floor(resto / 10)
    const unidade = resto % 10
    const emDezena: string[] = []
    if (dezena > 0) emDezena.push(DEZENAS[dezena])
    if (unidade > 0) emDezena.push(UNIDADES[unidade])
    // Dentro do grupo o "e" é obrigatório: "trinta e quatro", "cento e vinte".
    if (emDezena.length) partes.push(emDezena.join(' e '))
  }

  return partes.join(' e ')
}

/**
 * Escreve um número inteiro por extenso, sem unidade monetária.
 *
 * Zero devolve string vazia de propósito: quem chama decide se isso vira
 * "zero reais", "nenhum centavo" ou simplesmente nada — a resposta é diferente
 * em cada caso.
 */
export function inteiroPorExtenso(valor: number): string {
  const n = Math.trunc(Math.abs(valor))
  if (n === 0) return ''

  // Quebra em grupos de três, do mais significativo para o menos.
  const grupos: number[] = []
  let resto = n
  while (resto > 0) {
    grupos.unshift(resto % 1000)
    resto = Math.floor(resto / 1000)
  }

  const escritos: string[] = []
  grupos.forEach((grupo, i) => {
    if (grupo === 0) return
    const escala = ESCALAS[grupos.length - 1 - i]
    if (!escala) return
    if (escala.singular === 'mil') {
      // "mil", nunca "um mil".
      escritos.push(grupo === 1 ? 'mil' : `${grupoExtenso(grupo)} mil`)
    } else if (escala.singular) {
      escritos.push(`${grupoExtenso(grupo)} ${grupo === 1 ? escala.singular : escala.plural}`)
    } else {
      escritos.push(grupoExtenso(grupo))
    }
  })

  return juntarGrupos(escritos, grupos[grupos.length - 1])
}

/**
 * Cola os grupos com a pontuação certa.
 *
 * Duas regras, e as duas existem para o texto poder ser LIDO em voz alta na
 * hora de conferir o recibo:
 *
 *  1. O último grupo entra com "e" quando é menor que cem ou é uma centena
 *     redonda: "mil e trinta", "mil e quinhentos", "um milhão e cinco".
 *  2. Fora disso ele entra com um espaço simples: "mil quinhentos e trinta".
 *     Nem "e" (empilharia dois: "mil e quinhentos e trinta") nem vírgula, que
 *     numa quantia de quatro dígitos soa telegráfica.
 *
 * A vírgula fica reservada para separar as escalas maiores, onde ela de fato
 * ajuda: "um milhão, duzentos e trinta e quatro mil quinhentos e sessenta e
 * sete".
 */
function juntarGrupos(escritos: string[], ultimoGrupo: number): string {
  if (escritos.length <= 1) return escritos.join('')

  const inicio = escritos.slice(0, -1).join(', ')
  const fim = escritos[escritos.length - 1]
  const colaComE = ultimoGrupo < 100 || ultimoGrupo % 100 === 0
  return colaComE ? `${inicio} e ${fim}` : `${inicio} ${fim}`
}

/**
 * O "de" que aparece só às vezes.
 *
 * Diz-se "um milhão DE reais", mas "um milhão e quinhentos mil reais" — sem o
 * "de". A regra é simples quando enunciada: o "de" entra quando a palavra da
 * escala é a ÚLTIMA do extenso, isto é, quando o valor é um milhão/bilhão
 * redondo. "Mil" nunca leva "de" ("mil reais", jamais "mil de reais").
 */
function precisaDoDe(escrito: string): boolean {
  return /(milhão|milhões|bilhão|bilhões|trilhão|trilhões)$/.test(escrito)
}

/**
 * Valor em reais por extenso, pronto para o corpo do recibo.
 *
 * Exemplos:
 *   1530.5    → "mil quinhentos e trinta reais e cinquenta centavos"
 *   1         → "um real"
 *   0.5       → "cinquenta centavos"
 *   1_000_000 → "um milhão de reais"
 */
export function valorPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return ''
  if (valor > TETO_EXTENSO) return ''

  // Trabalha em CENTAVOS inteiros. Fazer as contas em reais com ponto flutuante
  // é como 1,07 vira 1,0699999 e o recibo sai com um centavo a menos.
  const centavosTotais = Math.round(valor * 100)
  const reais = Math.floor(centavosTotais / 100)
  const centavos = centavosTotais % 100

  const partes: string[] = []
  if (reais > 0) {
    const escrito = inteiroPorExtenso(reais)
    const ligacao = precisaDoDe(escrito) ? ' de ' : ' '
    partes.push(`${escrito}${ligacao}${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  }

  // Só acontece com valor zero, que o recibo não aceita — mas devolver "" aqui
  // deixaria o documento com um parêntese vazio. Melhor dizer o que é.
  if (partes.length === 0) return 'zero reais'

  return partes.join(' e ')
}
