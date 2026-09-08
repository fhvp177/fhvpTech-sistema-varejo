/**
 * A loja que NÃO usa caixa precisa continuar vendendo.
 *
 * ── ⚠️ O defeito que este arquivo pegou ────────────────────────────────────
 * A exigência de caixa aberto virou interruptor por loja (migration 048) para
 * que GN Modas, TOP CIMENTO e JM Peças — que nunca viram uma tela de caixa —
 * não amanhecessem sem poder vender depois da atualização.
 *
 * O interruptor foi feito no BANCO (`criarVenda` só barra quando
 * `exigeCaixaAberto()`) e no PDV (a tela de bloqueio só aparece quando a
 * exigência está ligada). Mas o handler `vendas:criar` continuou recusando
 * QUALQUER venda sem `caixa_id`, de um commit anterior:
 *
 *     if (!dados.caixa_id) throw new Error('CAIXA_FECHADO')
 *
 * E o PDV manda `caixa_id: null` justamente quando a exigência está desligada e
 * não há turno aberto. Resultado: a loja que o interruptor existia para proteger
 * era a única que não vendia — e sem aviso na tela, porque para ela o PDV não
 * desenha o bloqueio. O erro só aparecia no clique de "Finalizar", com o cliente
 * no balcão.
 *
 * ── Por que a guarda lê o arquivo ───────────────────────────────────────────
 * O handler chama `requerSessao()`, `obterBackupManager()` e o roteador do
 * Electron; montar tudo isso num teste seria simular o app inteiro para conferir
 * uma condição de três linhas. O que precisa ficar preso é a CONDIÇÃO: recusar
 * sem caixa só quando a loja exige caixa.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const IPC = readFileSync(join(AQUI, '..', 'vendas.ts'), 'utf-8')

describe('o handler de criar venda respeita o interruptor de caixa', () => {
  it('★ não recusa venda sem caixa quando a loja não exige caixa', () => {
    /*
     * ⚠️ A recusa incondicional é o defeito. Se esta linha voltar, a loja sem
     * caixa para de vender de novo — e nada mais no sistema fica vermelho.
     */
    const recusaCega = /if\s*\(\s*!dados\.caixa_id\s*\)\s*\{/
    expect(
      IPC,
      'o handler voltou a recusar toda venda sem caixa, ignorando o interruptor da loja'
    ).not.toMatch(recusaCega)
  })

  it('★ continua recusando quando a loja EXIGE caixa', () => {
    /*
     * O outro lado: afrouxar demais devolveria o buraco original, em que uma
     * venda entrava sem turno e o dinheiro ficava fora de toda conferência.
     *
     * A condição tem que ler a exigência da loja e ainda lançar CAIXA_FECHADO,
     * que é o código que o PDV entende para oferecer "abrir caixa".
     */
    expect(IPC, 'o handler deixou de consultar a exigência da loja').toContain('exigeCaixaAberto')
    expect(IPC).toMatch(/!dados\.caixa_id\s*&&\s*exigeCaixaAberto\(\)/)
    expect(IPC, 'o código de erro que o PDV reconhece sumiu').toContain("'CAIXA_FECHADO'")
  })
})
