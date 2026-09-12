/**
 * Os esquemas escritos à mão nos testes acompanham o banco de verdade.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 * Quatro vezes numa sessão só. Toda vez que uma coluna nova entra em `vendas`
 * ou `itens_venda`, os testes de consulta quebram em bloco com
 *
 *     table vendas has no column named <coluna>
 *
 * porque cada um deles carrega uma cópia à mão do CREATE TABLE. A cópia existe
 * por um bom motivo — rodar as migrations de verdade exigiria o `better-sqlite3`
 * compilado para o Electron, que não carrega no runtime dos testes —, mas ela
 * envelhece em silêncio até alguém rodar a suíte.
 *
 * O custo não é o teste vermelho: é o ciclo perdido. O defeito aparece longe da
 * mudança que o causou, e não diz o que fazer.
 *
 * ── O que esta guarda faz ───────────────────────────────────────────────────
 * Compara as colunas que o schema e as migrations criam com as que cada esquema
 * de teste declara, e falha dizendo exatamente qual coluna falta em qual
 * arquivo — antes de a suíte inteira ficar vermelha.
 *
 * ── ⚠️ Só cobra de quem INSERE, e o recorte é o ponto ──────────────────────
 * A primeira versão desta guarda cobrava toda tabela declarada em todo teste, e
 * acusou sessenta colunas em oito arquivos — quase tudo ruído. Vários esquemas
 * são mínimos de propósito: o do comprovante declara `vendas(id, total)` porque
 * é só disso que ele precisa, e engordá-lo o deixaria pior, não melhor. Um
 * esquema de teste existe para dizer de que o teste depende.
 *
 * O defeito real é estreito: quem chama `criarVenda` precisa da tabela
 * COMPLETA, porque aquele INSERT lista todas as colunas. Foi esse, e só esse,
 * que quebrou quatro vezes.
 *
 * Guarda que grita demais é guarda que alguém desliga.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ELECTRON = join(AQUI, '..', '..', '..')

/**
 * Tabela vigiada e a função cujo INSERT a preenche por inteiro.
 *
 * O teste só é cobrado se mencionar essa função — é o sinal de que ele exercita
 * o INSERT completo, e não apenas lê a tabela.
 */
const VIGIADAS: Array<{ tabela: string; inseridaPor: string }> = [
  { tabela: 'vendas', inseridaPor: 'criarVenda' },
  { tabela: 'itens_venda', inseridaPor: 'criarVenda' },
  /*
   * `produtos` entrou na lista em 11/09/2026, e entrou pelo mesmo motivo das
   * outras duas: custou um ciclo. Uma coluna nova em `produtos` derrubou treze
   * testes da importação de XML de uma vez, com a mesma mensagem sem pista
   * ("Cannot read properties of undefined"), porque a importação cria produto
   * pelo `criarProduto` e o INSERT dele também lista todas as colunas.
   */
  { tabela: 'produtos', inseridaPor: 'criarProduto' }
]

/** Extrai os nomes de coluna de um `CREATE TABLE <tabela> ( ... )`. */
function colunasDe(fonte: string, tabela: string): string[] | null {
  const re = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${tabela}\\s*\\(`, 'i')
  const m = re.exec(fonte)
  if (!m) return null

  // Percorre até o parêntese que fecha, contando aninhamento — um CHECK(...)
  // no meio da definição fecharia cedo demais numa busca ingênua.
  let profundidade = 1
  let i = m.index + m[0].length
  const inicio = i
  while (i < fonte.length && profundidade > 0) {
    if (fonte[i] === '(') profundidade++
    else if (fonte[i] === ')') profundidade--
    i++
  }
  /*
   * ⚠️ Os comentários de linha saem ANTES de dividir por vírgula, e isso já
   * custou um ciclo: o corpo é fatiado na vírgula e cada pedaço tem o nome da
   * coluna na frente, então uma coluna precedida de `-- comentário` vira um
   * pedaço que começa com `--`. O filtro logo abaixo descarta esse pedaço, e a
   * COLUNA some da lista junto com o comentário.
   *
   * O resultado é a pior forma de falha para uma guarda: ela continua verde
   * enquanto a coluna que deveria cobrar está invisível para ela.
   */
  const corpo = fonte.slice(inicio, i - 1).replace(/--[^\n]*/g, '')

  // Cada linha começa pelo nome da coluna. Descarta o que é cláusula de tabela.
  return corpo
    .split(/,(?![^(]*\))/)
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((n) => n && !/^(FOREIGN|PRIMARY|UNIQUE|CHECK|CONSTRAINT|--)$/i.test(n))
}

/** O que o banco de verdade tem: o schema base mais o que as migrations somam. */
function colunasReais(tabela: string): Set<string> {
  const schema = readFileSync(join(ELECTRON, 'db', 'schema.ts'), 'utf-8')
  const base = colunasDe(schema, tabela) ?? []
  const cols = new Set(base)

  const pastaMig = join(ELECTRON, 'backup', 'migrations')
  for (const arq of readdirSync(pastaMig).filter((f) => /^\d+_.*\.ts$/.test(f))) {
    const fonte = readFileSync(join(pastaMig, arq), 'utf-8')
    // `adicionarColunaSeAusente(db, 'vendas', 'turno_id', ...)`
    const re = new RegExp(
      `adicionarColunaSeAusente\\(\\s*db,\\s*'${tabela}',\\s*'(\\w+)'`,
      'g'
    )
    for (const m of fonte.matchAll(re)) cols.add(m[1])
    // `ALTER TABLE vendas ADD COLUMN turno_id ...`
    const reAlter = new RegExp(`ALTER TABLE ${tabela} ADD COLUMN (\\w+)`, 'gi')
    for (const m of fonte.matchAll(reAlter)) cols.add(m[1])
  }
  return cols
}

const ARQUIVOS_DE_TESTE = readdirSync(AQUI).filter((f) => f.endsWith('.test.ts'))

describe('os esquemas à mão dos testes acompanham o banco', () => {
  it('encontrou o schema e as migrations', () => {
    // Sem isto, um erro de caminho faria tudo passar sem comparar nada.
    expect(colunasReais('vendas').size, 'não li as colunas de vendas').toBeGreaterThan(8)
    expect(ARQUIVOS_DE_TESTE.length, 'não achei os testes desta pasta').toBeGreaterThan(2)
  })

  for (const { tabela, inseridaPor } of VIGIADAS) {
    it(`★ quem usa ${inseridaPor} declara ${tabela} inteira`, () => {
      const reais = colunasReais(tabela)
      const faltando: string[] = []

      for (const arq of ARQUIVOS_DE_TESTE) {
        if (arq === 'esquemasDeTesteAcompanham.test.ts') continue
        const fonte = readFileSync(join(AQUI, arq), 'utf-8')

        // Só cobra de quem exercita o INSERT completo. Teste que apenas lê a
        // tabela pode declarar o mínimo de que precisa.
        if (!fonte.includes(inseridaPor)) continue

        const declaradas = colunasDe(fonte, tabela)
        if (!declaradas) continue
        for (const col of reais) {
          if (!declaradas.includes(col)) faltando.push(`${arq}: falta ${tabela}.${col}`)
        }
      }

      expect(
        faltando.sort(),
        `este teste chama ${inseridaPor}, e o esquema à mão dele ficou para trás ` +
          'do banco. A suíte vai quebrar com "table X has no column named Y" — ' +
          'acrescente a coluna no CREATE TABLE do teste'
      ).toEqual([])
    })
  }
})
