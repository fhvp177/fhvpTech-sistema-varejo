/**
 * Cabeçalho de tabela que fica no topo tem que ser OPACO, e a cor tem que estar
 * na célula.
 *
 * ── O defeito que gerou isto ────────────────────────────────────────────────
 * Na tela de classificação fiscal, o cabeçalho e a primeira linha da lista
 * apareciam empilhados: dava para ler "Produto" e o nome de um cabo na mesma
 * altura. A causa eram duas coisas juntas, e cada uma sozinha já bastaria:
 *
 * 1. O fundo era `bg-muted/40`, quarenta por cento de opacidade. O conteúdo
 *    rolava por baixo e aparecia através.
 * 2. O fundo estava declarado no `<thead>`. Com `border-collapse: collapse`,
 *    que é o padrão do Tailwind, o navegador não pinta fundo de `thead` nem de
 *    `tr`: quem pinta são as células. Ou seja, mesmo com a cor cheia o
 *    cabeçalho continuaria transparente.
 *
 * ── Por que um teste, e não só consertar ────────────────────────────────────
 * O mesmo par de erros estava em NOVE telas dos dois aplicativos. Não foi
 * descuido de uma pessoa: `sticky top-0` com um fundo suave é o que qualquer um
 * escreve, e o resultado parece certo até a lista ter linhas suficientes para
 * rolar. Sem esta guarda, a décima tela nasce com ele.
 *
 * O certo é a classe `cabecalho-fixo` do index.css, que faz as duas coisas.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RAIZ_SRC = join(__dirname, '..', '..')
const CSS = readFileSync(join(RAIZ_SRC, 'index.css'), 'utf8')

function arquivosTsx(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosTsx(caminho))
    } else if (nome.endsWith('.tsx')) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('cabeçalho de tabela grudado no topo', () => {
  const arquivos = arquivosTsx(RAIZ_SRC)

  it('varreu a pasta src (se isto falhar, o resto vira teatro)', () => {
    expect(arquivos.length).toBeGreaterThan(20)
  })

  it('nenhum <thead> fixa a si mesmo na mão — todos usam a classe', () => {
    const culpados = arquivos
      .filter((caminho) => {
        const texto = readFileSync(caminho, 'utf8')
        return /<thead[^>]*className="[^"]*sticky/.test(texto)
      })
      .map((c) => c.replace(RAIZ_SRC, 'src'))

    expect(culpados, 'use className="cabecalho-fixo" no lugar de sticky na mão').toEqual([])
  })

  it('a classe existe, e pinta a CÉLULA com cor cheia', () => {
    expect(CSS).toContain('.cabecalho-fixo')
    // No `th`, não no `thead`: com border-collapse só a célula pinta.
    expect(CSS).toMatch(/\.cabecalho-fixo th\s*\{[^}]*background-color:\s*hsl\(var\(--muted\)\)/)
    // Sem barra de opacidade em lugar nenhum da regra.
    const regra = CSS.slice(CSS.indexOf('.cabecalho-fixo'))
    expect(regra.slice(0, 260)).not.toMatch(/--muted\)\s*\/\s*0?\.\d/)
  })

  it('a classe gruda no topo e fica por cima do conteúdo que rola', () => {
    const regra = CSS.slice(CSS.indexOf('.cabecalho-fixo {'))
    expect(regra.slice(0, 140)).toContain('position: sticky')
    expect(regra.slice(0, 140)).toContain('top: 0')
    // Sem z-index, célula de corpo com fundo próprio passa por cima.
    expect(regra.slice(0, 140)).toMatch(/z-index:\s*[1-9]/)
  })
})
