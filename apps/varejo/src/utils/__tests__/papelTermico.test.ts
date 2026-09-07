/**
 * Todo papel que sai na térmica obedece à mesma receita.
 *
 * ── Por que este teste existe ───────────────────────────────────────────────
 * O comprovante de entrega nasceu escrito do zero — Arial, 80mm, margem zero —
 * em vez de partir do cupom de venda, que já resolvia isso há tempos. Impresso,
 * saiu praticamente em branco e deslocado para a direita, com meio centímetro
 * aparecendo; depois, em branco por inteiro. As três causas estavam
 * explicadas em cupomVenda.ts o tempo todo.
 *
 * Existe a régua de verdade (`npm run medir:cupom`), que renderiza no Chromium
 * sob mídia de impressão e mede em milímetros. Mas ela precisa do Electron e é
 * rodada à mão — então este teste é o alarme barato, que dispara em toda
 * rodada, antes de alguém gastar bobina para descobrir.
 *
 * ── As três regras, e por quê ───────────────────────────────────────────────
 *  1. Courier em NEGRITO. A 203dpi a cabeça só sabe "queima ou não queima": não
 *     existe cinza. Traço fino cai no meio do caminho e vira ponto solto.
 *  2. Corpo de 68mm e nada de declarar o tamanho da página. A cabeça alcança
 *     72,07mm da borda esquerda; com 2mm de @page de cada lado sobram 68 e
 *     ainda 2mm de folga. E o Chromium ignora o papel do driver, então declarar
 *     `size` só faz a página ser diagramada num formato que a impressora depois
 *     desloca sozinha.
 *  3. Encostado à esquerda na impressão. Em bobina não existe "centro da
 *     folha": o Chromium monta a página no tamanho padrão dele, e a margem
 *     automática centraliza o corpo NELA — 68mm centralizados em 210 começam
 *     aos 71mm, e o papel tem 80. Foi esta a causa que sobrou depois de eu
 *     acertar as duas primeiras, e a que deixou o papel inteiramente em branco.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const UTILS = join(AQUI, '..')

/** Os arquivos que geram papel de 80mm. Um novo entra aqui junto com ele. */
const GERADORES = ['cupomVenda.ts', 'comprovanteDevolucao.ts', 'relatorioFinanceiro.ts']

/**
 * Só o que sai na térmica: o pedaço de CSS com `@page { margin: 2mm }`.
 *
 * ⚠️ Os comentários saem fora. O texto que explica cada regra contém a regra
 * escrita por extenso, e uma guarda que lesse o comentário passaria verde
 * exatamente quando o defeito estivesse posto.
 */
function folhasTermicas(fonte: string): string[] {
  const folhas: string[] = []
  const re = /<style>([\s\S]*?)<\/style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fonte)) !== null) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ')
    if (css.includes('68mm') || /@page\s*\{\s*margin:\s*2mm/.test(css)) folhas.push(css)
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

    it(`★ ${arquivo}: encostado à esquerda na impressão`, () => {
      for (const css of folhasTermicas(readFileSync(join(UTILS, arquivo), 'utf-8'))) {
        /*
         * A regra que de fato decide se sai alguma coisa no papel.
         *
         * Na tela o `margin: 0 auto` é bom: centraliza a prévia na janela. Na
         * impressão ele é fatal, porque centraliza na página que o Chromium
         * monta — larga, e não a bobina que o driver informou. Um corpo de 68mm
         * centralizado numa página de 210 começa aos 71mm, e o papel acaba nos 80.
         *
         * Foi assim que o comprovante de entrega saiu inteiro em branco: cabia
         * na bobina, tinha a fonte certa, e começava depois de onde o papel
         * terminava.
         */
        const bloco = css.match(/@media\s+print\s*\{([\s\S]*?\})\s*\}/)
        expect(bloco?.[1], `${arquivo}: não tem @media print`).toBeTruthy()
        expect(bloco![1], `${arquivo}: não encosta o corpo à esquerda ao imprimir`)
          .toMatch(/body\s*\{[^}]*\bmargin:\s*0\b(?!\s*auto)/)
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
