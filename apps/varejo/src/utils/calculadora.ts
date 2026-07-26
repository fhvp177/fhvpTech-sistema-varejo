// Motor da calculadora do balcão: recebe a expressão inteira que o lojista
// digitou ("89,90-10%") e devolve o resultado, com a precedência que se espera
// de matemática ("2+3*4" é 14, não 20).
//
// Escrito à mão, sem `eval` e sem biblioteca: `eval` executaria QUALQUER coisa
// que caísse neste campo, e um analisador de calculadora cabe em uma página.
// Como é função pura, todo o comportamento fica coberto por teste — que é o
// lugar certo pra fixar as regras de porcentagem abaixo.
//
// ── Duas regras que não são óbvias ───────────────────────────────────────────
//
// 1. PORCENTAGEM É A DE CALCULADORA DE LOJA, não a da matemática pura:
//    "200+10%" é 220 (dez por cento DE 200), não 200,1. É assim que o lojista
//    calcula acréscimo e desconto, e é o que a versão anterior já fazia.
//    Multiplicando ou dividindo, o % vira fração simples: "200*10%" é 20.
//
// 2. PONTO E VÍRGULA SÃO A MESMA COISA na ENTRADA — ambos são separador
//    decimal ("10.5" e "10,5" valem 10,5). Ninguém digita separador de milhar
//    numa calculadora, e o teclado numérico manda ora um, ora outro conforme o
//    layout. Por isso a expressão guardada NUNCA é a formatada: agrupamento de
//    milhar ("1.000.000") existe só na hora de exibir, em formatarExpressao/
//    formatarNumero. Misturar os dois faria "1.000" virar 1 vírgula zero.

export type ResultadoAvaliacao =
  | { ok: true; valor: number }
  | { ok: false; erro: string }

type Token =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'operador'; valor: '+' | '-' | '*' | '/' }
  | { tipo: 'abre' }
  | { tipo: 'fecha' }
  | { tipo: 'porcento' }

// O teclado da tela mostra × e ÷; o físico manda * e /. Aceitar os dois evita
// que o visor e o motor falem línguas diferentes.
const SINONIMOS: Record<string, string> = {
  '×': '*',
  '·': '*',
  '÷': '/',
  '−': '-',
  '–': '-'
}

class ErroCalculo extends Error {}

function tokenizar(entrada: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < entrada.length) {
    const bruto = entrada[i]
    const c = SINONIMOS[bruto] ?? bruto

    if (c === ' ') {
      i++
      continue
    }

    if (/[0-9]/.test(c) || ((c === ',' || c === '.') && /[0-9]/.test(entrada[i + 1] ?? ''))) {
      let texto = ''
      let separadores = 0
      while (i < entrada.length && /[0-9,.]/.test(entrada[i])) {
        if (entrada[i] === ',' || entrada[i] === '.') separadores++
        texto += entrada[i]
        i++
      }
      if (separadores > 1) {
        throw new ErroCalculo(`Número com vírgula a mais: "${texto}".`)
      }
      const valor = Number(texto.replace(',', '.'))
      if (!Number.isFinite(valor)) throw new ErroCalculo(`Número inválido: "${texto}".`)
      tokens.push({ tipo: 'numero', valor })
      continue
    }

    if (c === '+' || c === '-' || c === '*' || c === '/') {
      tokens.push({ tipo: 'operador', valor: c })
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ tipo: 'abre' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ tipo: 'fecha' })
      i++
      continue
    }
    if (c === '%') {
      tokens.push({ tipo: 'porcento' })
      i++
      continue
    }

    throw new ErroCalculo(`Não entendi "${bruto}" na conta.`)
  }

  return tokens
}

// Um valor durante a conta. `percentual` marca "este número veio com %" — quem
// consome decide o que isso significa, porque depende da operação (ver regra 1).
type Valor = { valor: number; percentual: boolean }

function analisar(tokens: Token[]): number {
  let i = 0
  const atual = (): Token | undefined => tokens[i]

  // Precedência nasce do encadeamento: soma chama produto, que chama fator.
  function soma(): Valor {
    let esquerda = produto()
    for (;;) {
      const t = atual()
      if (t?.tipo !== 'operador' || (t.valor !== '+' && t.valor !== '-')) break
      i++
      const direita = produto()
      // "200+10%" = 200 + 10% DE 200. Sem %, é a parcela crua.
      const parcela = direita.percentual
        ? (esquerda.valor * direita.valor) / 100
        : direita.valor
      esquerda = {
        valor: t.valor === '+' ? esquerda.valor + parcela : esquerda.valor - parcela,
        percentual: false
      }
    }
    return esquerda
  }

  function produto(): Valor {
    let esquerda = fator()
    for (;;) {
      const t = atual()
      if (t?.tipo !== 'operador' || (t.valor !== '*' && t.valor !== '/')) break
      i++
      const direita = fator()
      // Aqui o % é só fração: "200*10%" = 200 × 0,1 = 20.
      const valorDireita = direita.percentual ? direita.valor / 100 : direita.valor
      if (t.valor === '/' && valorDireita === 0) {
        throw new ErroCalculo('Não dá pra dividir por zero.')
      }
      esquerda = {
        valor: t.valor === '*' ? esquerda.valor * valorDireita : esquerda.valor / valorDireita,
        percentual: false
      }
    }
    return esquerda
  }

  function fator(): Valor {
    const t = atual()
    if (!t) throw new ErroCalculo('A conta está incompleta.')

    if (t.tipo === 'operador' && (t.valor === '-' || t.valor === '+')) {
      i++
      const f = fator()
      return { valor: t.valor === '-' ? -f.valor : f.valor, percentual: f.percentual }
    }

    if (t.tipo === 'abre') {
      i++
      const dentro = soma()
      if (atual()?.tipo !== 'fecha') throw new ErroCalculo('Faltou fechar um parêntese.')
      i++
      return comPorcento({ valor: dentro.valor, percentual: false })
    }

    if (t.tipo === 'numero') {
      i++
      return comPorcento({ valor: t.valor, percentual: false })
    }

    throw new ErroCalculo('A conta está incompleta.')
  }

  function comPorcento(v: Valor): Valor {
    if (atual()?.tipo === 'porcento') {
      i++
      return { valor: v.valor, percentual: true }
    }
    return v
  }

  const resultado = soma()
  if (i < tokens.length) throw new ErroCalculo('A conta está incompleta.')
  // "50%" sozinho vale 0,5 — sem ninguém à esquerda, é a fração pura.
  return resultado.percentual ? resultado.valor / 100 : resultado.valor
}

// Tira o lixo do ponto flutuante antes de mostrar: 0,1+0,2 dá
// 0,30000000000000004, e isso no visor de uma calculadora de loja parece
// defeito. Dez casas preservam qualquer conta de dinheiro.
export function arredondar(n: number): number {
  if (!Number.isFinite(n)) return n
  return Number(n.toFixed(10))
}

export function avaliarExpressao(expressao: string): ResultadoAvaliacao {
  const texto = expressao.trim()
  if (!texto) return { ok: false, erro: 'Digite uma conta.' }

  try {
    const valor = analisar(tokenizar(texto))
    if (!Number.isFinite(valor)) return { ok: false, erro: 'O resultado não é um número.' }
    return { ok: true, valor: arredondar(valor) }
  } catch (e) {
    if (e instanceof ErroCalculo) return { ok: false, erro: e.message }
    return { ok: false, erro: 'Não consegui calcular isso.' }
  }
}

// ── Exibição ─────────────────────────────────────────────────────────────────

// 1000000 -> "1.000.000"; 1234.5 -> "1.234,5"
export function formatarNumero(n: number): string {
  if (!Number.isFinite(n)) return 'Erro'
  return arredondar(n).toLocaleString('pt-BR', { maximumFractionDigits: 10 })
}

// Veste a expressão CRUA pra leitura: agrupa milhar em cada número e troca
// * e / pelos sinais que a pessoa reconhece. Só isso — o que volta daqui serve
// pra ler, nunca pra recalcular (ver regra 2 lá em cima).
export function formatarExpressao(expressao: string): string {
  return expressao
    .replace(/\d+(?:[,.]\d*)?/g, (numero) => {
      const [inteira, ...resto] = numero.split(/[,.]/)
      // Acima de 15 dígitos o Number perde precisão e o agrupamento mentiria.
      if (inteira.length > 15) return numero
      const inteiraFormatada = Number(inteira).toLocaleString('pt-BR')
      // `resto` vazio = número sem separador. Com separador (mesmo sem casas
      // ainda, como em "10,"), a vírgula fica — é o que a pessoa está digitando.
      return resto.length === 0 ? inteiraFormatada : `${inteiraFormatada},${resto[0]}`
    })
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
}
