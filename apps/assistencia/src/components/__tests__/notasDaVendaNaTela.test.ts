// O painel de notas fiscais da venda, visto pelo código-fonte.
//
// Os testes de comportamento desta casa rodam em ambiente Node, sem DOM — então
// a lógica que decide o que aparece mora em utils/notasDaVenda.ts, onde é
// testada de verdade. O que sobra aqui são as duas amarrações que nenhum teste
// de unidade alcança e que quebram em silêncio:
//
//   1. a tela de Vendas mandar os dois "tem" (peça e mão de obra) — sem eles o
//      painel não sabe quais notas cabem e volta a oferecer a errada;
//   2. o painel FECHAR antes de abrir o documento — é essa ordem que impede um
//      diálogo de nascer por cima do outro.
//
// Nenhuma das duas quebra typecheck, teste ou build. Só aparecem abrindo a tela.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ler = (rel: string): string => readFileSync(join(__dirname, '..', '..', rel), 'utf-8')

const vendas = ler(join('pages', 'Vendas.tsx'))
const painel = ler(join('components', 'NotasDaVenda.tsx'))

describe('a tela de Vendas fala com o painel, não com os botões', () => {
  it('a coluna de ações usa o painel', () => {
    expect(vendas).toContain('<NotasDaVenda')
  })

  it('não desenha mais os dois botões de nota soltos na linha', () => {
    // Era o que inchava a coluna: um ícone e um botão largo de texto no meio de
    // uma fileira de ícones. Quem precisar deles agora passa pelo painel.
    expect(vendas, 'BotaoNotaFiscal voltou pra coluna de ações').not.toContain('<BotaoNotaFiscal')
    expect(vendas, 'BotaoNotaServico voltou pra coluna de ações').not.toContain('<BotaoNotaServico')
  })

  it('manda saber se a venda tem peça E se tem mão de obra', () => {
    // Sem `tem_produto` o painel acha que toda venda tem mercadoria, e a
    // entrega de OS sem peça volta a oferecer uma nota que não tem o que
    // emitir. Sem `tem_servico`, a NFS-e some.
    expect(vendas).toContain('temProduto={Boolean(v.tem_produto)}')
    expect(vendas).toContain('temServico={Boolean(v.tem_servico)}')
  })
})

describe('o painel não empilha diálogo', () => {
  const corpoDoAbrir = (() => {
    const i = painel.indexOf('const abrir = (doc: Documento)')
    expect(i, 'não achei a função `abrir` do painel').toBeGreaterThan(-1)
    return painel.slice(i, painel.indexOf('\n  }', i))
  })()

  it('fecha o painel ANTES de mandar abrir o documento', () => {
    const fecha = corpoDoAbrir.indexOf('setPainelAberto(false)')
    const abre = corpoDoAbrir.indexOf('.abrir()')
    expect(fecha, 'o painel não se fecha ao escolher um documento').toBeGreaterThan(-1)
    expect(abre, 'ninguém manda o documento abrir').toBeGreaterThan(-1)
    expect(
      fecha,
      'o painel manda abrir antes de se fechar — o diálogo do documento nasce ' +
        'por cima dele, que é exatamente o que não pode acontecer'
    ).toBeLessThan(abre)
  })

  it('os botões perdem o próprio gatilho quando o painel está no comando', () => {
    // Com gatilho, os dois ícones reapareceriam na linha ao lado do ícone do
    // painel — três pontos de entrada para a mesma pergunta.
    const ocorrencias = painel.split('semGatilho={cabem.length > 1}').length - 1
    expect(ocorrencias, 'os dois botões precisam receber `semGatilho`').toBe(2)
  })
})

describe('quando cabe um documento só, o painel sai da frente', () => {
  it('devolve o botão do documento direto, sem diálogo intermediário', () => {
    // O caminho mais comum da loja é venda de peça, sem serviço. Ele não pode
    // ganhar um clique novo por causa de um painel que só teria uma linha.
    expect(painel).toContain('if (cabem.length === 1)')
    expect(painel).toMatch(/cabem\[0\] === 'mercadoria' \? notaFiscal : notaDeServico/)
  })

  it('venda sem item nenhum não mostra botão de nota', () => {
    expect(painel).toContain('if (cabem.length === 0) return null')
  })
})
