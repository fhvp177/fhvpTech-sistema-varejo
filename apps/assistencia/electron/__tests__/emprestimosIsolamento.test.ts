/**
 * Duas travas estruturais do módulo de Empréstimos.
 *
 * Elas leem o FONTE, e não o comportamento, porque o que está sob risco aqui não
 * é um cálculo errado — é alguém, meses adiante, ligar um fio que não devia ser
 * ligado. Um teste de comportamento só pegaria isso se já existisse um caso
 * cobrindo a fiação nova, que por definição ainda não existe. É a mesma escolha
 * do canais.test.ts e do camposComMascara.test.ts.
 *
 * ── Trava 1: empréstimo não é venda ─────────────────────────────────────────
 * O dinheiro do dono mora em três potes: venda (virou dele), despesa (saiu pra
 * sempre) e empréstimo (só mudou de lugar). Se empréstimo vazar pro faturamento,
 * o mês incha com dinheiro que não é receita; se a devolução do cliente também
 * virar venda, o mesmo dinheiro é contado duas vezes. Nada quebra, nada dá erro,
 * e o dono passa a decidir olhando um número mentiroso.
 *
 * ── Trava 2: a lista de devedores é do gerente ──────────────────────────────
 * Contas a Pagar protege só a rota na interface — `contasPagar:listar` responde
 * a qualquer sessão. Aqui isso não basta: a lista é "quem deve dinheiro ao
 * patrão". A proteção mora no backend, e este teste garante que ela não seja
 * esquecida num canal novo daqui a seis meses.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ELECTRON = join(AQUI, '..')

const ler = (rel: string): string => readFileSync(join(ELECTRON, rel), 'utf8')

describe('empréstimo não encosta em venda, estoque nem faturamento', () => {
  const fonte = ler('db/queries/emprestimos.ts')

  // Só o corpo do código: os comentários FALAM de vendas de propósito (é onde
  // está explicado por que os potes são separados), e proibir a palavra apagaria
  // justamente a explicação.
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

  it.each(['vendas', 'itens_venda', 'produtos', 'estoque', 'contas_pagar'])(
    'não consulta nem escreve na tabela %s',
    (tabela) => {
      expect(semComentarios).not.toMatch(new RegExp(`\\b${tabela}\\b`))
    }
  )

  it('o dashboard não soma empréstimo em lugar nenhum', () => {
    // O caminho inverso: mesmo que o módulo continue limpo, alguém pode puxar o
    // número de lá pra cá. O faturamento tem que ignorar a existência disso.
    const dashboard = ler('db/queries/dashboard.ts')
    expect(dashboard.toLowerCase()).not.toMatch(/emprestimo|empréstimo/)
  })
})

describe('todo canal de empréstimo exige gerente', () => {
  const fonte = ler('ipc/emprestimos.ts')

  /**
   * Único canal que responde a qualquer sessão, e de propósito: o menu lateral é
   * montado antes de saber o papel de quem entrou, e "esta loja usa empréstimos"
   * não conta nada sobre ninguém.
   */
  const LIBERADO = 'emprestimos:moduloAtivo'

  // Corta o fonte em um pedaço por canal registrado, pra olhar o corpo de cada um.
  const blocos = fonte.split("registrarCanal('").slice(1)

  it('encontrou os canais no fonte (se isto falhar, o resto vira teatro)', () => {
    expect(blocos.length).toBeGreaterThanOrEqual(11)
  })

  it.each(
    blocos.map((b) => [b.slice(0, b.indexOf("'")), b] as [string, string])
  )('%s chama requerDono()', (nome, bloco) => {
    if (nome === LIBERADO) {
      expect(bloco).not.toContain('requerDono()')
      return
    }
    expect(bloco).toContain('requerDono()')
  })
})
