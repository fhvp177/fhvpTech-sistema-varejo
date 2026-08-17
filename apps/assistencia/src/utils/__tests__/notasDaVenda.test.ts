// Quais notas cabem numa venda, e o que o ícone único da coluna de ações deve
// dizer sobre elas.
//
// Estes testes existem porque a regra é fácil de escrever errado de um jeito
// que ninguém percebe na tela: um ícone verde numa venda em que UMA das duas
// notas foi recusada parece certo — e o dono só descobre o buraco quando o
// contador fecha o mês.
//
// Para ver falhar: troque a ordem de precedência em `estadoCombinado` (ponha
// `completa` antes de `erro`) e o caso "peça saiu, serviço recusado" passa a
// pintar de verde.

import { describe, it, expect } from 'vitest'
import {
  documentosQueCabem,
  estadoCombinado,
  resumoDoEstado,
  type StatusMercadoria,
  type StatusServico
} from '../notasDaVenda'

const venda = (
  temProduto: boolean,
  temServico: boolean,
  statusMercadoria: StatusMercadoria | null = null,
  statusServico: StatusServico | null = null
) => ({ temProduto, temServico, statusMercadoria, statusServico })

describe('quais documentos cabem na venda', () => {
  it('venda de balcão, só peça: uma nota só', () => {
    expect(documentosQueCabem({ temProduto: true, temServico: false })).toEqual(['mercadoria'])
  })

  it('entrega de OS sem peça: só a nota de serviço', () => {
    // É o caso que motivou tudo isto. Antes a tela oferecia a nota de
    // mercadoria aqui, e a emissão morria com "Esta venda não tem itens" —
    // mensagem errada, porque a venda TEM itens, só não tem mercadoria.
    expect(documentosQueCabem({ temProduto: false, temServico: true })).toEqual(['servico'])
  })

  it('venda mista: as duas, mercadoria primeiro', () => {
    expect(documentosQueCabem({ temProduto: true, temServico: true })).toEqual([
      'mercadoria',
      'servico'
    ])
  })

  it('venda sem item nenhum: nenhuma nota a oferecer', () => {
    expect(documentosQueCabem({ temProduto: false, temServico: false })).toEqual([])
  })
})

describe('o que o ícone diz numa venda mista', () => {
  it('nada emitido', () => {
    expect(estadoCombinado(venda(true, true))).toBe('nenhuma')
  })

  it('as duas autorizadas', () => {
    expect(estadoCombinado(venda(true, true, 'autorizado', 'autorizada'))).toBe('completa')
  })

  it('só a de peça saiu: falta a outra', () => {
    expect(estadoCombinado(venda(true, true, 'autorizado', null))).toBe('parcial')
  })

  it('só a de serviço saiu: falta a outra', () => {
    expect(estadoCombinado(venda(true, true, null, 'autorizada'))).toBe('parcial')
  })

  it('★ peça autorizada e serviço RECUSADO pinta de erro, não de verde', () => {
    // A asserção que mais importa do arquivo. Uma nota boa ao lado não pode
    // esconder uma recusada: quem só olha a cor da linha precisa ver o
    // problema no dia, não no fechamento do mês.
    expect(
      estadoCombinado(venda(true, true, 'autorizado', 'negada')),
      'a nota recusada sumiu atrás da que deu certo'
    ).toBe('erro')
  })

  it('erro vem antes de processando', () => {
    expect(estadoCombinado(venda(true, true, 'erro', 'processando'))).toBe('erro')
  })

  it('uma esperando resposta', () => {
    expect(estadoCombinado(venda(true, true, 'autorizado', 'processando'))).toBe('processando')
    expect(estadoCombinado(venda(true, true, 'pendente', null))).toBe('processando')
  })
})

describe('só conta o que cabe naquela venda', () => {
  it('venda só de peça ignora um status de serviço pendurado', () => {
    // Cenário real: a venda teve o item de serviço estornado, mas a NFS-e
    // recusada continua no banco. O ícone não pode ficar vermelho para sempre
    // por causa de um documento que já não cabe ali.
    expect(estadoCombinado(venda(true, false, 'autorizado', 'negada'))).toBe('completa')
  })

  it('venda só de serviço ignora o lado da mercadoria', () => {
    expect(estadoCombinado(venda(false, true, 'rejeitado', 'autorizada'))).toBe('completa')
  })
})

describe('nota cancelada volta a convidar', () => {
  it('cancelada não conta como emitida', () => {
    // Cancelada = o documento deixou de existir para o Fisco, e a venda voltou
    // a ser uma venda sem nota. Reemitir é caminho legítimo, então o ícone tem
    // que chamar em vez de dizer "está tudo resolvido".
    expect(estadoCombinado(venda(true, false, 'cancelado', null))).toBe('nenhuma')
    expect(estadoCombinado(venda(true, true, 'cancelado', 'cancelada'))).toBe('nenhuma')
  })

  it('uma cancelada e a outra válida ainda é parcial', () => {
    expect(estadoCombinado(venda(true, true, 'cancelado', 'autorizada'))).toBe('parcial')
  })
})

describe('o texto que o dono lê antes de clicar', () => {
  it('fala no plural só quando há duas notas', () => {
    expect(resumoDoEstado('completa', ['mercadoria', 'servico'])).toMatch(/duas notas/i)
    expect(resumoDoEstado('completa', ['mercadoria'])).not.toMatch(/duas/i)
  })

  it('erro em venda mista não promete qual das duas falhou', () => {
    // Dizer "a nota não foi aceita" numa venda com duas notas manda o dono
    // procurar no lugar errado.
    expect(resumoDoEstado('erro', ['mercadoria', 'servico'])).toMatch(/uma das notas/i)
  })
})
