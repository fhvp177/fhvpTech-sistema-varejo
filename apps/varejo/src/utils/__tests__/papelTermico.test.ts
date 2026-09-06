/**
 * Todo papel que sai na térmica obedece à mesma receita.
 *
 * ── Por que este teste existe ───────────────────────────────────────────────
 * O comprovante de entrega nasceu escrito do zero — Arial, 80mm, margem zero —
 * em vez de partir do cupom de venda, que já resolvia isso há tempos. Impresso,
 * saiu praticamente em branco e deslocado para a direita, com meio centímetro
 * aparecendo. As duas causas estavam explicadas em cupomVenda.ts o tempo todo.
 *
 * Existe a régua de verdade (`npm run medir:cupom`), que renderiza no Chromium
 * sob mídia de impressão e mede em milímetros. Mas ela precisa do Electron e é
 * rodada à mão — então este teste é o alarme barato, que dispara em toda
 * rodada, antes de alguém gastar bobina para descobrir.
 *
 * ── As duas regras, e por quê ───────────────────────────────────────────────
 *  1. Courier em NEGRITO. A 203dpi a cabeça só sabe "queima ou não queima": não
 *     existe cinza. Traço fino cai no meio do caminho e vira ponto solto.
 *  2. Corpo de 68mm e nada de declarar o tamanho da página. A cabeça alcança
 *     72,07mm da borda esquerda; com 2mm de @page de cada lado sobram 68 e
 *     ainda 2mm de folga. E o Chromium ignora o papel do driver, então declarar
 *     `size` só faz a página ser diagramada num formato que a impressora depois
 *     desloca sozinha.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const UTILS = join(AQUI, '..')

/** Os arquivos que geram papel de 80mm. Um novo entra aqui junto com ele. */
const GERADORES = ['cupomVenda.ts', 'comprovanteDevolucao.ts', 'relatorioFinanceiro.ts']

/** Só o que sai na térmica: o pedaço de CSS com `@page { margin: 2mm }`. */
function folhasTermicas(fonte: string): string[] {
  const folhas: string[] = []
  const re = /<style>([\s\S]*?)<\/style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fonte)) !== null) {
    if (m[1].includes('68mm') || /@page\s*\{\s*margin:\s*2mm/.test(m[1])) folhas.push(m[1])
  }
  return folhas
}

describe('papel de 80mm segue a receita da térmica', () => {
  it('encontrou as folhas mesmo', () => {
    // Sem isto, um erro no caminho faria o teste passar sem olhar nada.
    const todas = GERADORES.flatMap((g) => folhasTermicas(readFileSync(join(UTILS, g), 'utf-8')))
    expect(todas.length, 'nenhuma folha térmica encontrada — a varredura quebrou')
      .toBeGreaterThanOrEqual(3)
  })

  for (const arquivo of GERADORES) {
    it(`★ ${arquivo}: corpo de 68mm, sem declarar o tamanho da página`, () => {
      for (const css of folhasTermicas(readFileSync(join(UTILS, arquivo), 'utf-8'))) {
        /*
         * ⚠️ Declarar o tamanho da página foi metade do defeito do comprovante
         * de entrega: a página saiu diagramada em 80mm e a impressora deslocou
         * por cima disso.
         */
        expect(css, `${arquivo}: declarou size no @page`).not.toMatch(/@page[^}]*\bsize\s*:/)
        expect(css, `${arquivo}: o corpo deixou de ter 68mm`).toContain('width: 68mm')
      }
    })

    it(`★ ${arquivo}: Courier em negrito, senão sai em branco`, () => {
      for (const css of folhasTermicas(readFileSync(join(UTILS, arquivo), 'utf-8'))) {
        expect(css, `${arquivo}: perdeu a monoespaçada`).toMatch(/font-family:\s*'Courier New'/)
        /*
         * O negrito é o que faz a letra queimar inteira. Sem ele o papel sai
         * pálido ou vazio — foi o que aconteceu com Arial 11px no comprovante
         * de entrega, e é o tipo de defeito que só o papel na mão revela.
         */
        expect(css, `${arquivo}: perdeu o negrito da térmica`).toMatch(/font-weight:\s*bold/)
      }
    })
  }
})
