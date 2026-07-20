// Validação dos campos da tela de nota fiscal. Código puro (sem React, sem IPC)
// pra ser testável no vitest.
//
// A régua desta tela é mais dura que a do resto do sistema: campo fiscal errado
// não dá erro na hora, dá nota rejeitada no balcão — ou pior, nota aceita com
// dado errado, que vira problema do lojista numa fiscalização. Então a regra
// aqui é impedir a digitação inválida, não avisar depois.

// ─── Inscrição Estadual ───────────────────────────────────────────────────────
// NÃO existe uma máscara única de IE: cada estado tem o seu formato e a sua
// quantidade de dígitos. Por isso a validação é por UF.
//
// O que esta tabela faz: quantos dígitos a IE tem em cada estado. Alguns
// aceitam dois tamanhos (formato antigo e novo convivendo).
//
// O que esta tabela NÃO faz: conferir o dígito verificador. Cada estado usa um
// cálculo próprio — são 27 algoritmos distintos — e um algoritmo implementado
// errado REJEITA inscrição válida, que é pior que não conferir. Tamanho errado
// já pega o grosso dos enganos (dígito a mais, dígito a menos, campo colado
// pela metade); o resto a SEFAZ acusa na primeira emissão, de forma visível.
export const DIGITOS_IE_POR_UF: Record<string, number[]> = {
  AC: [13],
  AL: [9],
  AP: [9],
  AM: [9],
  BA: [8, 9],
  CE: [9],
  DF: [13],
  ES: [9],
  GO: [9],
  MA: [9],
  MT: [11],
  MS: [9],
  MG: [13],
  PA: [9],
  PB: [9],
  PR: [10],
  PE: [9, 14],
  PI: [9],
  RJ: [8],
  RN: [9, 10],
  RS: [10],
  RO: [14],
  RR: [9],
  SC: [9],
  SE: [9],
  SP: [12],
  TO: [9, 11]
}

export function apenasDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

// Maior tamanho aceito pela UF — vira o maxLength do campo, pra digitação parar
// sozinha em vez de deixar o lojista escrever à toa e descobrir depois.
export function maxDigitosIE(uf: string): number {
  const tamanhos = DIGITOS_IE_POR_UF[(uf ?? '').toUpperCase()]
  // Sem UF conhecida, usa o maior tamanho existente no país (RO/PE, 14).
  return tamanhos ? Math.max(...tamanhos) : 14
}

// Texto de ajuda do campo: "9 dígitos" ou "9 ou 10 dígitos".
export function formatoEsperadoIE(uf: string): string | null {
  const tamanhos = DIGITOS_IE_POR_UF[(uf ?? '').toUpperCase()]
  if (!tamanhos) return null
  const lista = tamanhos.join(' ou ')
  return `${lista} ${tamanhos.length === 1 && tamanhos[0] === 1 ? 'dígito' : 'dígitos'}`
}

export type Validacao = { valido: boolean; erro: string | null }

const OK: Validacao = { valido: true, erro: null }

export function validarInscricaoEstadual(valor: string, uf: string): Validacao {
  const digitos = apenasDigitos(valor)
  if (!digitos) return { valido: false, erro: 'Informe a inscrição estadual.' }

  // Sem UF, não dá pra saber o tamanho certo. Não inventa regra: aceita e deixa
  // a tela cobrar o preenchimento do endereço da loja.
  const tamanhos = DIGITOS_IE_POR_UF[(uf ?? '').toUpperCase()]
  if (!tamanhos) return OK

  if (!tamanhos.includes(digitos.length)) {
    const esperado = tamanhos.join(' ou ')
    return {
      valido: false,
      erro: `No ${uf.toUpperCase()}, a inscrição estadual tem ${esperado} dígitos — você digitou ${digitos.length}.`
    }
  }

  // Inscrição toda com o mesmo dígito (000000000, 111111111) é engano ou
  // preenchimento de teste; nenhum estado emite assim.
  if (/^(\d)\1+$/.test(digitos)) {
    return { valido: false, erro: 'Inscrição estadual inválida.' }
  }

  return OK
}

// ─── E-mail ───────────────────────────────────────────────────────────────────
// Proposital: validação simples (tem "algo@algo.algo", sem espaço). Regex de
// e-mail "completa" é famosa por rejeitar endereço válido, e aqui o campo serve
// pra comunicação fiscal — o custo de barrar um endereço bom é maior que o de
// aceitar um duvidoso.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validarEmail(valor: string): Validacao {
  const limpo = (valor ?? '').trim()
  if (!limpo) return { valido: false, erro: 'Informe o e-mail da empresa.' }
  if (!EMAIL.test(limpo)) return { valido: false, erro: 'E-mail inválido.' }
  return OK
}

// ─── Série da nota ────────────────────────────────────────────────────────────
// Faixas definidas pela SEFAZ (ver documentação da ACBr, campo `serie`):
//   0-889   série normal        ← a única que o lojista usa
//   890-899 avulsa do Fisco
//   900-999 SCAN (contingência)
// Deixar o lojista digitar 900 aqui produziria nota rejeitada na hora da venda.
export const SERIE_MIN = 0
export const SERIE_MAX = 889

export function validarSerie(valor: number | string): Validacao {
  const texto = String(valor ?? '').trim()
  if (!texto) return { valido: false, erro: 'Informe a série.' }
  if (!/^\d+$/.test(texto)) return { valido: false, erro: 'A série é um número inteiro.' }

  const n = Number(texto)
  if (n < SERIE_MIN || n > SERIE_MAX) {
    return {
      valido: false,
      erro: `A série normal vai de ${SERIE_MIN} a ${SERIE_MAX}. Acima disso é reservado ao Fisco.`
    }
  }
  return OK
}

// ─── Regime tributário ────────────────────────────────────────────────────────
export function validarRegime(valor: string): Validacao {
  if (!['1', '2', '3'].includes(valor)) {
    return { valido: false, erro: 'Selecione o regime tributário.' }
  }
  return OK
}
