/**
 * Campo de dinheiro não é `type="number"`, e quem lê o que foi digitado usa
 * `paraNumero`.
 *
 * ── Os dois defeitos que este teste separa ──────────────────────────────────
 *
 * **1. O campo.** `type="number"` entrega o valor com o separador decimal da
 * MÁQUINA, mostra setinhas que ninguém usa e, no celular, abre um teclado sem
 * vírgula. A regra da casa já foi cobrada quatro vezes, e nas três primeiras o
 * que faltava era sempre um campo de dinheiro.
 *
 * **2. A leitura.** Este é o perigoso. Com máscara, R$ 1.234,56 chega ao código
 * como o texto "1.234,56". Um `parseFloat` ingênuo lê 1.234 — mil vezes menos —
 * e o número continua PARECENDO válido, então nada acusa. O inverso já
 * aconteceu de verdade nos Empréstimos: uma leitura que tirava os pontos virou
 * 600,00 em 60000, cem vezes mais, direto no saldo de um cliente.
 *
 * Por isso os dois andam juntos: trocar o campo sem trocar a leitura é pior do
 * que não ter trocado nada. Este teste prende o par.
 *
 * ⚠️ `Emprestimos.tsx` está FORA da lista de propósito. Ele tem `paraNumero`
 * próprio, escrito para `type="number"`, e converter aquela tela é mexer em
 * saldo de cliente — trabalho separado, com teste separado.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { paraNumero, paraMascara } from '../../utils/mascaras'

const RAIZ_SRC = join(__dirname, '..', '..')

/** Tela → os campos de dinheiro dela que já seguem a regra. */
const TELAS_DE_DINHEIRO: Record<string, string[]> = {
  'pages/Produtos.tsx': ['preco', 'custo'],
  'pages/ContasPagar.tsx': ['valor'],
  'pages/Contas.tsx': ['conta-saldo']
}

describe('campo de dinheiro: máscara no campo e leitura que entende milhar', () => {
  for (const [tela, campos] of Object.entries(TELAS_DE_DINHEIRO)) {
    const fonte = (() => {
      try {
        return readFileSync(join(RAIZ_SRC, tela), 'utf8')
      } catch {
        return null
      }
    })()

    it(`${tela}: nenhum campo de dinheiro é type="number"`, () => {
      if (fonte === null) return // tela não existe neste aplicativo
      for (const campo of campos) {
        // O bloco do campo: do `id="campo"` até o fim da tag.
        const i = fonte.indexOf(`id="${campo}"`)
        expect(i, `campo ${campo} sumiu de ${tela}`).toBeGreaterThan(-1)
        const bloco = fonte.slice(Math.max(0, i - 200), i + 400)
        expect(bloco, `${campo} voltou a ser type="number"`).not.toContain('type="number"')
        expect(bloco, `${campo} perdeu a máscara`).toContain('CLASSE_DINHEIRO')
      }
    })
  }

  it('★ a leitura entende o separador de milhar — é aqui que mora o erro de 1000x', () => {
    expect(paraNumero('1.234,56')).toBe(1234.56)
    expect(paraNumero('10,50')).toBe(10.5)
    expect(paraNumero('600,00')).toBe(600)
    expect(paraNumero('1.000.000,00')).toBe(1000000)
    // Sem nada digitado o resultado é 0, NÃO NaN. Por isso toda tela barra o
    // campo vazio ANTES de converter: senão um produto sem preço entra a zero.
    expect(paraNumero('')).toBe(0)
  })

  it('★ ida e volta não perde nem inventa centavo', () => {
    for (const valor of [0.01, 10.5, 600, 1234.56, 1000000]) {
      expect(paraNumero(paraMascara(valor))).toBe(valor)
    }
  })
})
