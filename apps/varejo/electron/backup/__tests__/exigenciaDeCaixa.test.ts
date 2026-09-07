/**
 * O interruptor "não vende sem caixa aberto", e o padrão de cada loja.
 *
 * ── O que está em jogo ──────────────────────────────────────────────────────
 * A mesma versão vai para a loja que pediu o livro-caixa e para clientes que
 * nunca viram uma tela de caixa. Se o padrão vier errado, o cliente abre o
 * sistema na manhã seguinte à atualização e não consegue vender — com gente no
 * balcão e sem entender o motivo.
 *
 * É o único item da release que muda a rotina de quem já usa, e o padrão é
 * DEDUZIDO do que cada banco mostra. Por isso a dedução tem teste próprio.
 */
import { describe, expect, it, beforeEach } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

const seTiverSqlite = sqlite ? it : it.skip

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE _migrations (nome TEXT PRIMARY KEY);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE vendas (id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL);
    CREATE TABLE turnos_caixa (id INTEGER PRIMARY KEY AUTOINCREMENT, conta_id INTEGER);
  `)
})

/**
 * A mesma dedução da migration 048.
 *
 * ⚠️ Reproduzida aqui porque a migration recebe um `better-sqlite3`, binário
 * compilado para o Electron que não carrega no runtime dos testes — a limitação
 * anotada em migrations.test.ts. A guarda estrutural no fim do arquivo é quem
 * cobra que as duas não se separem.
 */
function deduzirPadrao(): string {
  const jaExiste = db!
    .prepare("SELECT valor FROM config WHERE chave = 'exigir_caixa_aberto'")
    .get() as { valor: string } | undefined
  if (jaExiste) return jaExiste.valor

  const temTurno = db!.prepare('SELECT 1 FROM turnos_caixa LIMIT 1').get()
  const temVenda = db!.prepare('SELECT 1 FROM vendas LIMIT 1').get()
  const ligado = temTurno ? true : !temVenda
  const valor = ligado ? '1' : '0'
  db!
    .prepare("INSERT INTO config (chave, valor) VALUES ('exigir_caixa_aberto', ?)")
    .run(valor)
  return valor
}

describe('o padrão do interruptor', () => {
  seTiverSqlite('★ loja que JÁ usa caixa continua exigindo', () => {
    /*
     * Ela adotou a proteção. Desligá-la numa atualização seria remover, sem
     * pedir, um controle que a loja escolheu ter — e ninguém perceberia até a
     * primeira conferência que não fecha.
     */
    db!.prepare('INSERT INTO vendas (total) VALUES (100)').run()
    db!.prepare('INSERT INTO turnos_caixa (conta_id) VALUES (1)').run()
    expect(deduzirPadrao()).toBe('1')
  })

  seTiverSqlite('★ loja que já vende e NUNCA abriu caixa não é barrada', () => {
    /*
     * O caso que motivou o interruptor inteiro. É o cliente que opera há meses
     * sem caixa; para ele isto é novidade, e novidade não pode chegar impedindo
     * a primeira venda do dia.
     */
    db!.prepare('INSERT INTO vendas (total) VALUES (100)').run()
    expect(deduzirPadrao()).toBe('0')
  })

  seTiverSqlite('★ instalação nova começa exigindo', () => {
    // Sem venda nenhuma não há hábito a quebrar, e o jeito certo é o padrão.
    expect(deduzirPadrao()).toBe('1')
  })

  seTiverSqlite('★ caixa aberto sem venda ainda conta como "já usa"', () => {
    /*
     * ⚠️ A ordem dos dois testes importa, e é isto que a fixa.
     *
     * Esta loja abriu o caixa e ainda não vendeu. Se "não tem venda" fosse
     * avaliado antes de "tem turno", ela cairia na regra da instalação nova —
     * chegaria ao mesmo resultado por coincidência, e deixaria de chegar no dia
     * em que a outra regra mudasse.
     */
    db!.prepare('INSERT INTO turnos_caixa (conta_id) VALUES (1)').run()
    expect(deduzirPadrao()).toBe('1')
  })

  seTiverSqlite('★ escolha já feita pelo lojista não é sobreposta', () => {
    /*
     * Ele desligou de propósito numa loja que usa caixa. Reaplicar a dedução
     * religaria — a máquina passando por cima de uma decisão de quem opera.
     */
    db!
      .prepare("INSERT INTO config (chave, valor) VALUES ('exigir_caixa_aberto', '0')")
      .run()
    db!.prepare('INSERT INTO turnos_caixa (conta_id) VALUES (1)').run()
    expect(deduzirPadrao()).toBe('0')
  })
})

describe('a leitura do interruptor', () => {
  it('★ o padrão de quem não respondeu é EXIGIR', () => {
    /*
     * `exigeCaixaAberto` devolve `valor !== '0'`, e não `valor === '1'`.
     *
     * A diferença aparece quando a chave não existe — config apagada, banco
     * restaurado pela metade, migration que não rodou. Nesses casos o valor
     * seguro é o que protege o dinheiro; a única porta para desligar é a
     * migration 048, que só o faz para a loja que comprovadamente já vendia
     * sem caixa.
     */
    const fonte = new URL('../../db/queries/turnos.ts', import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const texto = require('fs').readFileSync(fonte, 'utf-8') as string
    expect(texto, 'a leitura passou a exigir "1" explícito, e falha aberta')
      .toContain("return r?.valor !== '0'")
  })

  it('★ o banco recusa a venda sem caixa quando a exigência está ligada', () => {
    /*
     * A regra tem que morar no banco, não na tela: o segundo caixa fala pelo
     * mesmo canal, e uma versão antiga do renderer não sabe do interruptor.
     * Antes, o guarda só existia quando a tela mandava o caixa — bastava não
     * mandar para a venda passar sem turno.
     */
    const fonte = new URL('../../db/queries/vendas.ts', import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const texto = require('fs').readFileSync(fonte, 'utf-8') as string
    expect(texto, 'venda sem caixa_id deixou de ser recusada com a exigência ligada')
      .toMatch(/}\s*else if \(exigeCaixaAberto\(\)\) \{[\s\S]*?throw new Error\('CAIXA_FECHADO'\)/)
  })

  it('★ a dedução do teste continua igual à da migration', () => {
    // As duas são cópias. Esta asserção é quem impede que se separem.
    const fonte = new URL('../migrations/048_exigir_caixa_aberto.ts', import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const texto = require('fs').readFileSync(fonte, 'utf-8') as string
    expect(texto, 'a regra do padrão mudou na migration e não aqui')
      .toContain('const ligado = temTurno ? true : !temVenda')
  })
})
