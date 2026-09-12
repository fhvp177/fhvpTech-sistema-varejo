/**
 * O comprovante de abertura de caixa.
 *
 * ── Por que ele existe ──────────────────────────────────────────────────────
 * Faltava. Só o de fechamento tinha sido feito, e a falta foi notada assim:
 * "cadê os cupons de abertura e fechamento de caixa? Só estou vendo o cupom de
 * fechamento" (11/09/2026).
 *
 * ── ★ O que este arquivo prende, e é uma coisa só ───────────────────────────
 * Que o papel da abertura NÃO traga valor esperado nem contagem.
 *
 * O fechamento desta loja é ÀS CEGAS de propósito: o operador conta a gaveta
 * sem saber quanto deveria ter. Um papel de abertura que trouxesse qualquer
 * número comparável com a gaveta no fim do dia desmontaria isso em silêncio, e
 * ninguém ligaria uma coisa à outra meses depois.
 */
import { describe, it, expect } from 'vitest'
import { gerarHtmlAberturaCaixa } from '../relatorioFinanceiro'

const TURNO = {
  id: 7,
  conta_nome: 'Caixa da loja',
  aberto_por_nome: 'Ana',
  aberto_em: '2026-09-11 08:03:00',
  fundo_troco: 150
}

describe('gerarHtmlAberturaCaixa', () => {
  it('traz quem abriu, quando, e o fundo de troco', () => {
    const html = gerarHtmlAberturaCaixa(TURNO)
    expect(html).toContain('Abertura de caixa #7')
    expect(html).toContain('Caixa da loja')
    expect(html).toContain('Ana')
    expect(html).toContain('150,00')
    expect(html).toContain('11/09/2026')
  })

  it('★ NÃO traz valor esperado nem contagem, para o fechamento continuar às cegas', () => {
    const html = gerarHtmlAberturaCaixa(TURNO).toLowerCase()
    expect(html).not.toContain('esperado')
    expect(html).not.toContain('contado')
    expect(html).not.toContain('diferença')
  })

  it('tem linha de assinatura: é papel para conferir com o dinheiro na mão', () => {
    expect(gerarHtmlAberturaCaixa(TURNO)).toContain('Responsável pela abertura')
  })

  it('turno aberto sem nome de operador não quebra o papel', () => {
    const html = gerarHtmlAberturaCaixa({ ...TURNO, aberto_por_nome: null })
    expect(html).toContain('Abertura de caixa #7')
    expect(html).toContain('—')
  })

  it('fundo de troco zero sai como R$ 0,00, e não em branco', () => {
    // Abrir sem troco é uma decisão; papel em branco parece campo esquecido.
    expect(gerarHtmlAberturaCaixa({ ...TURNO, fundo_troco: 0 })).toContain('0,00')
  })
})
