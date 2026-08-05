// O bloco de classificação fiscal (NCM/CFOP/CSOSN) tem que ficar DENTRO do
// formulário do produto. Da v1.29 até a v1.33 ele esteve, por engano, dentro do
// diálogo "Cadastro Rápido de Fornecedor": o `</DialogContent>` do produto
// fechava algumas linhas antes, e o bloco caía no diálogo seguinte.
//
// Duas coisas tornam esse defeito perigoso:
//   1. ele é INVISÍVEL pra typecheck, teste e build — o JSX é válido, o
//      componente existe, os tipos batem. Só aparece abrindo a tela;
//   2. a consequência é silenciosa: o contador não consegue corrigir o NCM de
//      um produto específico, e o único caminho que resta é a classificação em
//      massa. A tela aponta "N produtos sem NCM" e não deixa resolver um.
//
// O teste olha o CÓDIGO-FONTE, e não o DOM, porque o defeito é de estrutura de
// JSX — renderizar o componente em jsdom não diria em qual diálogo ele nasceu.
// Mesmo princípio do larguraDosDialogos.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const fonte = readFileSync(join(__dirname, '..', 'Produtos.tsx'), 'utf-8')

describe('classificação fiscal no formulário do produto', () => {
  const usoDoBloco = fonte.indexOf('<FiscalProdutoCampos')
  const dialogoProduto = fonte.indexOf('<Dialog open={dialogAberto}')
  const dialogoFornecedor = fonte.indexOf('<Dialog open={modalFornecedorAberto}')

  it('os dois diálogos e o bloco fiscal existem no arquivo', () => {
    // Se algum destes sumir, o teste abaixo passaria por acidente.
    expect(usoDoBloco, 'não achei <FiscalProdutoCampos').toBeGreaterThan(-1)
    expect(dialogoProduto, 'não achei o Dialog do produto').toBeGreaterThan(-1)
    expect(dialogoFornecedor, 'não achei o Dialog do fornecedor').toBeGreaterThan(-1)
    expect(dialogoFornecedor).toBeGreaterThan(dialogoProduto)
  })

  it('o bloco fiscal fica depois do Dialog do produto e ANTES do de fornecedor', () => {
    expect(usoDoBloco).toBeGreaterThan(dialogoProduto)
    expect(
      usoDoBloco,
      'O bloco de NCM/CFOP caiu no diálogo de cadastro de fornecedor. ' +
        'Ele precisa estar dentro do formulário do produto — é lá que o ' +
        'contador corrige o NCM de um item.'
    ).toBeLessThan(dialogoFornecedor)
  })

  it('aparece uma vez só', () => {
    const ocorrencias = fonte.split('<FiscalProdutoCampos').length - 1
    expect(ocorrencias).toBe(1)
  })
})
