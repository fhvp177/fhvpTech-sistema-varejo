/**
 * A venda não pode ceder a vez no meio.
 *
 * ── O que está sendo protegido ───────────────────────────────────────────────
 * `criarVenda` confere o estoque item a item e SÓ DEPOIS abre a transação que
 * grava e decrementa. Entre a conferência e a gravação não existe pausa — e é
 * só por isso que a coisa é segura. Se houvesse uma pausa ali, duas vendas
 * simultâneas poderiam ambas conferir "tem 1 em estoque", ambas passarem, e
 * ambas gravarem: a mesma unidade vendida duas vezes.
 *
 * Hoje isso funciona por acidente feliz — ninguém escreveu como regra. Com uma
 * máquina só o acidente é inofensivo, porque não há duas vendas ao mesmo tempo.
 * Com o segundo caixa passa a haver, e o bug seria silencioso: aparece na
 * contagem de estoque semanas depois, sem como saber qual venda estava certa.
 *
 * ── A corrente de três elos ──────────────────────────────────────────────────
 * 1. A camada de queries é toda síncrona          → este arquivo
 * 2. O handler `vendas:criar` é síncrono          → este arquivo
 * 3. O roteador não embrulha síncrono em promessa → roteador.test.ts
 *
 * Os três juntos provam que "conferir estoque → gravar" roda sem brecha. Se
 * qualquer um cair, a garantia cai junto — por isso os três têm teste.
 *
 * ── Se este teste falhar ─────────────────────────────────────────────────────
 * Alguém tornou assíncrona uma função que mexe no banco. Isso pode ser
 * legítimo, mas NÃO é detalhe: exige mover a conferência para dentro da
 * transação, ou travar a linha, antes de seguir.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PASTA_QUERIES = join(AQUI, '..', 'db', 'queries')
const IPC_VENDAS = join(AQUI, '..', 'ipc', 'vendas.ts')

/** Tira comentários pra não acusar a palavra "await" escrita em prosa. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function arquivosDeQuery(): string[] {
  return readdirSync(PASTA_QUERIES)
    .filter((n) => n.endsWith('.ts'))
    .map((n) => join(PASTA_QUERIES, n))
}

describe('a camada de queries nunca cede a vez', () => {
  it('encontra os arquivos de query', () => {
    // Guarda contra caminho errado: sem isso, zero arquivo passaria por vácuo.
    expect(arquivosDeQuery().length).toBeGreaterThanOrEqual(15)
  })

  it('não tem função assíncrona', () => {
    const culpados = arquivosDeQuery()
      .flatMap((arq) => {
        const achados = [...semComentarios(readFileSync(arq, 'utf8')).matchAll(/\basync\b/g)]
        return achados.length ? [`${arq.split(/[\\/]/).pop()} (${achados.length}x)`] : []
      })
      .sort()

    expect(
      culpados,
      'Função assíncrona na camada de queries. O banco é síncrono (better-sqlite3) ' +
        'e é isso que faz "conferir estoque → gravar" acontecer sem brecha. ' +
        'Introduzir uma pausa aqui permite duas máquinas venderem a mesma unidade.'
    ).toEqual([])
  })

  it('não tem await', () => {
    const culpados = arquivosDeQuery()
      .flatMap((arq) => {
        const achados = [...semComentarios(readFileSync(arq, 'utf8')).matchAll(/\bawait\b/g)]
        return achados.length ? [`${arq.split(/[\\/]/).pop()} (${achados.length}x)`] : []
      })
      .sort()

    expect(culpados, 'await na camada de queries — ver a mensagem do teste anterior.').toEqual([])
  })
})

describe('criarVenda confere o estoque e grava sem pausa', () => {
  const fonte = semComentarios(readFileSync(join(PASTA_QUERIES, 'vendas.ts'), 'utf8'))

  it('é declarada síncrona', () => {
    expect(fonte).toMatch(/export function criarVenda\b/)
    expect(fonte).not.toMatch(/export async function criarVenda\b/)
  })

  it('confere o estoque antes de abrir a transação', () => {
    const corpo = fonte.slice(fonte.indexOf('export function criarVenda'))
    const conferencia = corpo.indexOf('Estoque insuficiente')
    const transacao = corpo.indexOf('db.transaction(')

    expect(conferencia).toBeGreaterThan(-1)
    expect(transacao).toBeGreaterThan(-1)
    // Se a ordem inverter, a conferência passa a ler estoque já decrementado.
    expect(conferencia).toBeLessThan(transacao)
  })
})

describe('o handler de venda é síncrono', () => {
  const fonte = semComentarios(readFileSync(IPC_VENDAS, 'utf8'))

  it('vendas:criar não é async', () => {
    expect(fonte).toMatch(/registrarCanal\('vendas:criar',\s*\(/)
    expect(fonte).not.toMatch(/registrarCanal\('vendas:criar',\s*async/)
  })

  // vendas:cancelar É async de propósito: espera o PIN do gerente. A espera
  // acontece ANTES de `cancelarVenda`, então a leitura e a escrita continuam
  // coladas. O que não pode é a espera entrar no meio.
  it('vendas:cancelar espera o PIN antes de mexer no banco', () => {
    const corpo = fonte.slice(fonte.indexOf("registrarCanal('vendas:cancelar'"))
    const espera = corpo.indexOf('await verificarPinDono')
    const escrita = corpo.indexOf('cancelarVenda(')

    expect(espera).toBeGreaterThan(-1)
    expect(escrita).toBeGreaterThan(espera)
  })
})
