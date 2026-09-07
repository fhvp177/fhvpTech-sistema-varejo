/**
 * Toda data gravada é a HORA DA LOJA, nunca UTC.
 *
 * ── O defeito que originou este arquivo ─────────────────────────────────────
 * `CURRENT_TIMESTAMP`, no SQLite, é UTC. Sempre — em qualquer fuso da máquina.
 * Não é configuração que alguém esqueceu: é a definição da função.
 *
 * As tabelas antigas usam esse default (`data DATETIME DEFAULT
 * CURRENT_TIMESTAMP`) e as novas, do livro-caixa, usam
 * `datetime('now','localtime')`. Resultado: a MESMA venda gravava
 *
 *     vendas.data                       → 2026-09-07 01:42  (UTC)
 *     movimentos_financeiros.data       → 2026-09-06 22:42  (hora da loja)
 *
 * Mesmo instante, três horas e um DIA de diferença.
 *
 * ── Por que isso é dinheiro, e não cosmética ────────────────────────────────
 * O faturamento do dia filtra `date(v.data)` e o dinheiro do caixa vem dos
 * movimentos. Toda venda feita depois das 21h caía num dia no relatório e no
 * outro no caixa — os dois números ficavam certos isoladamente, e a diferença
 * entre eles não tinha explicação em lugar nenhum da tela.
 *
 * ── Por que a guarda lê o SQL em vez de medir o relógio ─────────────────────
 * Comparar o valor gravado com "agora" só reprova se o teste rodar numa
 * máquina fora de UTC. Na integração contínua, que roda em UTC, os dois são
 * iguais e o teste passaria verde com o defeito posto — que é o pior tipo de
 * guarda. Ler o SQL responde a pergunta certa em qualquer lugar.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const QUERIES = join(AQUI, '..')

/** O trecho do INSERT numa tabela, do `INSERT INTO x` até a crase de fechamento. */
function insertDe(fonte: string, tabela: string): string {
  const i = fonte.indexOf(`INSERT INTO ${tabela} (`)
  expect(i, `não achei o INSERT em ${tabela} — a varredura quebrou`).toBeGreaterThan(-1)
  return fonte.slice(i, fonte.indexOf('`', i))
}

/*
 * Cada linha: o arquivo, a tabela e a coluna de data que ele precisa preencher.
 *
 * Tabela nova com coluna de data entra aqui junto com ela.
 */
const GRAVAM_DATA: Array<{ arquivo: string; tabela: string; coluna: string }> = [
  { arquivo: 'vendas.ts', tabela: 'vendas', coluna: 'data' },
  { arquivo: 'clientes.ts', tabela: 'clientes', coluna: 'data_cadastro' },
  { arquivo: 'produtos.ts', tabela: 'produtos', coluna: 'data_cadastro' }
]

describe('as datas gravadas são a hora da loja', () => {
  for (const { arquivo, tabela, coluna } of GRAVAM_DATA) {
    it(`★ ${tabela}.${coluna} é escrita explicitamente, em hora local`, () => {
      /*
       * ⚠️ A coluna precisa aparecer na LISTA do INSERT.
       *
       * Omiti-la não dá erro: o SQLite cai no default da coluna, que é
       * `CURRENT_TIMESTAMP` — ou seja, volta silenciosamente para UTC. É
       * exatamente assim que o defeito existia, e é o que esta linha impede.
       */
      const sql = insertDe(readFileSync(join(QUERIES, arquivo), 'utf-8'), tabela)

      expect(sql, `${tabela}: a coluna ${coluna} saiu da lista do INSERT — sem ela o ` +
        'SQLite usa o default da tabela, que é CURRENT_TIMESTAMP (UTC)')
        .toContain(coluna)

      expect(sql, `${tabela}: a data deixou de ser gravada em hora local`)
        .toContain("datetime('now','localtime')")
    })
  }

  it('★ nenhum INSERT usa CURRENT_TIMESTAMP', () => {
    /*
     * A porta dos fundos: escrever `CURRENT_TIMESTAMP` à mão no INSERT passaria
     * na asserção acima (a coluna está lá) e gravaria UTC do mesmo jeito.
     */
    for (const { arquivo } of GRAVAM_DATA) {
      const fonte = readFileSync(join(QUERIES, arquivo), 'utf-8')
      const emInsert = [...fonte.matchAll(/INSERT INTO \w+ \([\s\S]*?\)`/g)]
        .map((m) => m[0])
        .filter((s) => s.includes('CURRENT_TIMESTAMP'))
      expect(emInsert, `${arquivo}: INSERT gravando CURRENT_TIMESTAMP, que é UTC`)
        .toEqual([])
    }
  })

  it('★ a loja hospedada declara o fuso', () => {
    /*
     * O outro lado do mesmo defeito, e o que fazia a loja do cliente inteira
     * andar três horas adiante.
     *
     * No aplicativo instalado o fuso vem do Windows do lojista e está certo. O
     * contêiner nasce em UTC, então `datetime('now','localtime')` LÁ devolvia
     * UTC — e o conserto acima não teria efeito nenhum na loja hospedada, que é
     * justamente onde o cliente está.
     */
    const toml = readFileSync(join(QUERIES, '..', '..', '..', 'fly.loja.toml'), 'utf-8')
    expect(toml, 'a loja hospedada voltou a rodar sem fuso, ou seja, em UTC')
      .toMatch(/^\s*TZ\s*=\s*"America\/\w+"/m)
  })
})
