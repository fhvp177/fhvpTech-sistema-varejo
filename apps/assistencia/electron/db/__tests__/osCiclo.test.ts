import { describe, expect, it } from 'vitest'
import {
  estaEncerrada,
  GARANTIA_PADRAO_DIAS,
  podeTransitar,
  ROTULOS_STATUS,
  STATUS_ENCERRADOS,
  transicoesPermitidas,
  type StatusOS
} from '../queries/osCiclo'

describe('ciclo de vida da OS (osCiclo)', () => {
  it('percorre o caminho feliz da bancada', () => {
    expect(podeTransitar('aberta', 'orcamento', 'bancada')).toBe(true)
    expect(podeTransitar('orcamento', 'aguardando_aprovacao', 'bancada')).toBe(true)
    expect(podeTransitar('aguardando_aprovacao', 'aprovada', 'bancada')).toBe(true)
    expect(podeTransitar('aprovada', 'em_reparo', 'bancada')).toBe(true)
    expect(podeTransitar('em_reparo', 'pronta', 'bancada')).toBe(true)
    expect(podeTransitar('pronta', 'entregue', 'bancada')).toBe(true)
  })

  it('externo passa pelo agendamento; bancada não agenda', () => {
    expect(podeTransitar('aprovada', 'agendada', 'externo')).toBe(true)
    expect(podeTransitar('agendada', 'em_reparo', 'externo')).toBe(true)
    expect(podeTransitar('aprovada', 'agendada', 'bancada')).toBe(false)
    // externo também pode ir direto pro reparo, sem agendar
    expect(podeTransitar('aprovada', 'em_reparo', 'externo')).toBe(true)
  })

  it('aguardando peça é ida e volta do reparo', () => {
    expect(podeTransitar('em_reparo', 'aguardando_peca', 'bancada')).toBe(true)
    expect(podeTransitar('aguardando_peca', 'em_reparo', 'bancada')).toBe(true)
    expect(podeTransitar('aguardando_peca', 'pronta', 'bancada')).toBe(false)
  })

  it('cliente pode recusar, e o orçamento pode voltar pra ajuste', () => {
    expect(podeTransitar('aguardando_aprovacao', 'recusada', 'bancada')).toBe(true)
    expect(podeTransitar('aguardando_aprovacao', 'orcamento', 'bancada')).toBe(true)
  })

  it('não deixa pular etapas', () => {
    expect(podeTransitar('aberta', 'aprovada', 'bancada')).toBe(false)
    expect(podeTransitar('orcamento', 'pronta', 'bancada')).toBe(false)
    expect(podeTransitar('aberta', 'entregue', 'bancada')).toBe(false)
    expect(podeTransitar('pronta', 'aberta', 'bancada')).toBe(false)
  })

  it('cancelamento vale em qualquer estado em andamento, nunca nos encerrados', () => {
    const emAndamento: StatusOS[] = [
      'aberta', 'orcamento', 'aguardando_aprovacao', 'aprovada',
      'agendada', 'em_reparo', 'aguardando_peca', 'pronta'
    ]
    for (const s of emAndamento) {
      expect(podeTransitar(s, 'cancelada', 'externo')).toBe(true)
    }
    for (const s of STATUS_ENCERRADOS) {
      expect(podeTransitar(s, 'cancelada', 'externo')).toBe(false)
      expect(transicoesPermitidas(s, 'externo')).toEqual([])
      expect(estaEncerrada(s)).toBe(true)
    }
  })

  it('transicoesPermitidas esconde "agendada" da bancada', () => {
    expect(transicoesPermitidas('aprovada', 'bancada')).toEqual(['em_reparo', 'cancelada'])
    expect(transicoesPermitidas('aprovada', 'externo')).toEqual(['em_reparo', 'agendada', 'cancelada'])
  })

  it('garantia padrão é 45 dias (decisão de 2026-07-05) e todo status tem rótulo', () => {
    expect(GARANTIA_PADRAO_DIAS).toBe(45)
    for (const rotulo of Object.values(ROTULOS_STATUS)) {
      expect(rotulo.length).toBeGreaterThan(0)
    }
  })
})
