/**
 * Guardião de relógio: as contas e a decisão de tratamento.
 *
 * O caso que originou estes testes é real (2026-08-02): o cliente copiou os
 * dados do computador da loja para um notebook, a âncora veio junto apontando
 * para o futuro, e o sistema — com a data do notebook CORRETA — acusou
 * "relógio incorreto" e mandou o lojista para a tela de licença, como se
 * tivesse perdido tudo.
 *
 * Por isso os cenários abaixo são escritos do ponto de vista de quem está na
 * loja, não do algoritmo.
 */
import { describe, expect, it } from 'vitest'
import {
  avaliarRelogio,
  calcularAncora,
  decidirTratamento,
  interpretarHeartbeat,
  lerHoraDoCabecalho,
  relogioConfereComServidor,
  TOLERANCIA_RELOGIO_MS,
  TOLERANCIA_SERVIDOR_MS
} from '@fhvptech/core/electron/relogioLogica'
import { bloqueioDeRelogio } from '@fhvptech/core/lib/relogioBloqueio'

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
const AGORA = new Date('2026-08-02T21:00:00Z').getTime()

describe('âncora', () => {
  it('usa a maior entre heartbeat e última venda', () => {
    expect(calcularAncora({ heartbeatMs: AGORA, maxVendaMs: AGORA + DIA, ignorarAte: 0 })).toBe(
      AGORA + DIA
    )
    expect(calcularAncora({ heartbeatMs: AGORA + DIA, maxVendaMs: AGORA, ignorarAte: 0 })).toBe(
      AGORA + DIA
    )
  })

  it('sem heartbeat e sem vendas, não há âncora', () => {
    expect(calcularAncora({ heartbeatMs: null, maxVendaMs: null, ignorarAte: 0 })).toBe(0)
  })

  it('ignora venda já desmentida por relógio confiável', () => {
    // Sem esta regra, apagar o heartbeat não adiantaria: a venda com data no
    // futuro re-travaria o sistema na abertura seguinte.
    const vendaFutura = AGORA + 25 * DIA
    expect(
      calcularAncora({ heartbeatMs: AGORA, maxVendaMs: vendaFutura, ignorarAte: vendaFutura })
    ).toBe(AGORA)
  })

  it('não ignora venda posterior à marca d\'água', () => {
    const desmentidoAte = AGORA + 10 * DIA
    expect(
      calcularAncora({ heartbeatMs: AGORA, maxVendaMs: AGORA + 30 * DIA, ignorarAte: desmentidoAte })
    ).toBe(AGORA + 30 * DIA)
  })
})

describe('heartbeat gravado por versões anteriores', () => {
  // O risco real da mudança: toda loja instalada tem um arquivo no formato
  // antigo. Se ele deixasse de ser lido, a máquina perderia a referência de
  // tempo silenciosamente e a trava simplesmente sumiria.
  it('lê o formato antigo, que só tinha ts', () => {
    expect(interpretarHeartbeat({ ts: AGORA })).toEqual({
      ts: AGORA,
      ignorarAte: 0,
      destravadoEm: undefined
    })
  })

  it('lê o formato novo inteiro', () => {
    expect(interpretarHeartbeat({ ts: AGORA, ignorarAte: AGORA + DIA, destravadoEm: AGORA })).toEqual(
      { ts: AGORA, ignorarAte: AGORA + DIA, destravadoEm: AGORA }
    )
  })

  it('recusa conteúdo sem ts utilizável', () => {
    expect(interpretarHeartbeat({ ignorarAte: 10 })).toBeNull()
    expect(interpretarHeartbeat({ ts: 'ontem' })).toBeNull()
    expect(interpretarHeartbeat({ ts: NaN })).toBeNull()
    expect(interpretarHeartbeat(null)).toBeNull()
    expect(interpretarHeartbeat('lixo')).toBeNull()
  })

  it('campo estranho no arquivo não derruba a leitura', () => {
    expect(interpretarHeartbeat({ ts: AGORA, futuroCampoNovo: true })?.ts).toBe(AGORA)
  })
})

describe('veredito do relógio', () => {
  it('deixa passar quando o tempo anda para frente', () => {
    expect(avaliarRelogio(AGORA, AGORA - DIA)).toBe('ok')
  })

  it('instalação nova não tem o que checar', () => {
    expect(avaliarRelogio(AGORA, 0)).toBe('sem-ancora')
  })

  it('voltar pouco avisa, não bloqueia', () => {
    expect(avaliarRelogio(AGORA, AGORA + HORA)).toBe('voltou-pouco')
    expect(avaliarRelogio(AGORA, AGORA + TOLERANCIA_RELOGIO_MS)).toBe('voltou-pouco')
  })

  it('bloqueia só passando da tolerância', () => {
    expect(avaliarRelogio(AGORA, AGORA + TOLERANCIA_RELOGIO_MS + 1)).toBe('bloqueia')
    expect(avaliarRelogio(AGORA, AGORA + 20 * DIA)).toBe('bloqueia')
  })
})

describe('conferência com o servidor', () => {
  it('relógio certo confere', () => {
    expect(relogioConfereComServidor(AGORA, AGORA + 3000)).toBe(true)
  })

  it('fuso mal configurado ainda confere', () => {
    expect(relogioConfereComServidor(AGORA, AGORA + 3 * HORA)).toBe(true)
  })

  it('relógio atrasado de propósito não confere', () => {
    expect(relogioConfereComServidor(AGORA - 30 * DIA, AGORA)).toBe(false)
    expect(relogioConfereComServidor(AGORA - TOLERANCIA_SERVIDOR_MS - 1, AGORA)).toBe(false)
  })

  it('lê o cabeçalho Date e recusa lixo', () => {
    expect(lerHoraDoCabecalho('Sun, 02 Aug 2026 21:00:00 GMT')).toBe(AGORA)
    expect(lerHoraDoCabecalho(null)).toBeNull()
    expect(lerHoraDoCabecalho('')).toBeNull()
    expect(lerHoraDoCabecalho('ontem de tarde')).toBeNull()
  })
})

describe('o que fazer quando a trava dispara', () => {
  it('servidor concorda com a máquina → conserta sozinho', () => {
    // O caso do cliente: data certa, âncora podre. Ninguém vê tela de erro.
    expect(decidirTratamento(AGORA, AGORA + 2000)).toBe('consertar')
  })

  it('servidor desmente a máquina → continua bloqueado', () => {
    // A fraude que a trava existe para pegar: relógio atrasado de propósito.
    expect(decidirTratamento(AGORA - 30 * DIA, AGORA)).toBe('relogio-errado-mesmo')
  })

  it('sem internet → não inventa que está tudo certo', () => {
    expect(decidirTratamento(AGORA, null)).toBe('sem-conferencia')
  })
})

describe('o que a tela recebe', () => {
  const relogio = { tratamento: 'sem-conferencia', horaLocalISO: '2026-08-02T21:00:00.000Z' }

  it('licença válida nunca vira tela de relógio', () => {
    expect(bloqueioDeRelogio({ valida: true, motivo: 'relogio', relogio })).toBeNull()
  })

  it('licença vencida vai para a tela de licença, não a de relógio', () => {
    expect(bloqueioDeRelogio({ valida: false })).toBeNull()
  })

  it('bloqueio de relógio vira tela de relógio', () => {
    expect(bloqueioDeRelogio({ valida: false, motivo: 'relogio', relogio })).toEqual({
      tratamento: 'sem-conferencia',
      horaLocalISO: '2026-08-02T21:00:00.000Z',
      horaServidorISO: undefined
    })
  })

  it('"consertar" não é bloqueio — prenderia o lojista numa tela sem saída', () => {
    expect(
      bloqueioDeRelogio({ valida: false, motivo: 'relogio', relogio: { ...relogio, tratamento: 'consertar' } })
    ).toBeNull()
  })

  it('motivo de relógio sem os dados do relógio não bloqueia por engano', () => {
    expect(bloqueioDeRelogio({ valida: false, motivo: 'relogio' })).toBeNull()
  })
})
