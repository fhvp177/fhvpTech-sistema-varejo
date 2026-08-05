// Os blocos de classificação fiscal têm que ficar DENTRO do formulário de
// cadastro, e cada um só aparece pro que lhe cabe.
//
// Contexto: no varejo, da v1.29 até a v1.33, o bloco de NCM caiu por engano
// dentro do diálogo "Cadastro Rápido de Fornecedor" — o `</DialogContent>` do
// produto fechava antes, e o JSX seguinte pertencia ao diálogo de baixo. Isso
// passou por typecheck, teste e build sem um pio, e deixou o contador sem
// caminho pra corrigir o NCM de um produto específico. A assistência herdou o
// defeito na cópia e ele foi consertado aqui.
//
// Aqui há uma regra a mais que no varejo: peça é tributada pelo ESTADO (NCM,
// CFOP, CSOSN) e serviço pelo MUNICÍPIO (item da LC 116, alíquota de ISS).
// Mostrar o bloco errado convidaria a preencher imposto do documento errado.
//
// O teste olha o CÓDIGO-FONTE porque o defeito é de estrutura de JSX —
// renderizar em jsdom não diria dentro de qual diálogo o bloco nasceu.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const fonte = readFileSync(join(__dirname, '..', 'Produtos.tsx'), 'utf-8')

const posProduto = fonte.indexOf('<FiscalProdutoCampos')
const posServico = fonte.indexOf('<FiscalServicoCampos')
const dialogoProduto = fonte.indexOf('<Dialog open={dialogAberto}')
const dialogoFornecedor = fonte.indexOf('<Dialog open={modalFornecedorAberto}')

describe('classificação fiscal no formulário certo', () => {
  it('os dois blocos e os dois diálogos existem', () => {
    // Sem esta checagem, os testes abaixo passariam por acidente se algum
    // sumisse do arquivo.
    expect(posProduto, 'não achei <FiscalProdutoCampos').toBeGreaterThan(-1)
    expect(posServico, 'não achei <FiscalServicoCampos').toBeGreaterThan(-1)
    expect(dialogoProduto, 'não achei o Dialog do produto').toBeGreaterThan(-1)
    expect(dialogoFornecedor, 'não achei o Dialog do fornecedor').toBeGreaterThan(-1)
    expect(dialogoFornecedor).toBeGreaterThan(dialogoProduto)
  })

  for (const [nome, pos] of [
    ['peça (NCM/CFOP)', () => posProduto],
    ['serviço (LC 116/ISS)', () => posServico]
  ] as const) {
    it(`o bloco de ${nome} fica no formulário do produto, não no de fornecedor`, () => {
      expect(pos()).toBeGreaterThan(dialogoProduto)
      expect(
        pos(),
        'Este bloco caiu no diálogo de cadastro rápido de fornecedor. ' +
          'Ele precisa estar dentro do formulário de cadastro — é lá que o ' +
          'contador ajusta a classificação de um item.'
      ).toBeLessThan(dialogoFornecedor)
    })
  }

  it('cada bloco aparece uma vez só', () => {
    expect(fonte.split('<FiscalProdutoCampos').length - 1).toBe(1)
    expect(fonte.split('<FiscalServicoCampos').length - 1).toBe(1)
  })

  // A regra que impede preencher imposto do documento errado.
  it('peça e serviço são mutuamente exclusivos na tela', () => {
    expect(fonte).toContain('FiscalProdutoCampos && !ehServico')
    expect(fonte).toContain('FiscalServicoCampos && ehServico')
  })

  it('cada tipo grava só a própria classificação', () => {
    // Mandar NCM pra um serviço (ou LC 116 pra uma peça) sujaria o cadastro.
    const i = fonte.indexOf('const salvar = async')
    const corpo = fonte.slice(i, fonte.indexOf('const abrirEdicao', i))
    expect(corpo).toContain('salvarServico')
    expect(corpo).toContain('salvarProduto')
    expect(corpo).toContain('ehServico')
  })
})
