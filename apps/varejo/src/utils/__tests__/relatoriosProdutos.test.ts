import { describe, it, expect } from 'vitest'
import { gerarHtmlTabelaReferencias } from '../relatoriosProdutos'

// A tabela de referências é a "cola do balcão" — o papel que o vendedor consulta
// pra achar o número que vai digitar no PDV. Se a ordem não for a numérica, ele
// varre a folha inteira procurando o 2 depois do 10, e o papel perde a serventia.

type P = Parameters<typeof gerarHtmlTabelaReferencias>[0][number]
const produto = (referencia: string, nome: string): P =>
  ({ referencia, nome }) as P

// Extrai as referências na ordem em que saíram no HTML.
function refsNaOrdem(html: string): string[] {
  return [...html.matchAll(/<span class="ref">([^<]*)<\/span>/g)].map((m) => m[1])
}

describe('gerarHtmlTabelaReferencias — ordem', () => {
  it('ordena por número de verdade, não como texto', () => {
    // Ordenado como texto, "10" viria antes de "2" — que é o bug que isto
    // impede. A referência é TEXT no banco porque aceita letras também.
    const html = gerarHtmlTabelaReferencias([
      produto('10', 'Camiseta'),
      produto('2', 'Boné'),
      produto('1', 'Calça'),
      produto('100', 'Meia'),
      produto('20', 'Bermuda'),
      produto('3', 'Jaqueta')
    ])
    expect(refsNaOrdem(html)).toEqual(['1', '2', '3', '10', '20', '100'])
  })

  it('referências com letra vêm depois dos números, agrupadas', () => {
    // Formato de catálogo de fornecedor ("AZ-15") convive com a numeração
    // automática — não pode embaralhar a lista.
    const html = gerarHtmlTabelaReferencias([
      produto('B-2', 'Item B'),
      produto('5', 'Item 5'),
      produto('AZ-15', 'Item AZ'),
      produto('1', 'Item 1')
    ])
    expect(refsNaOrdem(html)).toEqual(['1', '5', 'AZ-15', 'B-2'])
  })

  it('produto sem referência não quebra a tabela', () => {
    const html = gerarHtmlTabelaReferencias([
      produto('2', 'Com referência'),
      { referencia: null, nome: 'Sem referência' } as P
    ])
    const refs = refsNaOrdem(html)
    expect(refs).toHaveLength(2)
    expect(refs).toContain('2')
    expect(refs).toContain('—') // placeholder de quem não tem
  })

  it('lista vazia gera a folha sem quebrar', () => {
    expect(() => gerarHtmlTabelaReferencias([])).not.toThrow()
  })
})
