// O bloco de dados fiscais do cliente tem que ficar DENTRO do diálogo do
// cliente e DEPOIS do campo CNPJ.
//
// A ordem não é gosto: dentro do bloco existe um botão que busca a empresa na
// Receita Federal a partir do CNPJ digitado. Se o bloco subir para antes do
// campo, o botão passa a pedir um dado que ainda não foi preenchido e a única
// coisa que o lojista consegue dele é "preencha o CNPJ do cliente antes de
// buscar" — um botão que só sabe reclamar.
//
// Este teste existe porque o defeito é INVISÍVEL para typecheck, teste de
// comportamento e build: mover JSX de lugar num formulário grande gera código
// válido, com os tipos batendo, que só se revela abrindo a tela. Foi assim que
// o bloco de NCM passou da v1.29 à v1.33 dentro do diálogo de fornecedor —
// ver camposFiscaisNoFormCerto.test.ts, que guarda o mesmo tipo de acidente na
// tela de produtos.
//
// Por isso ele lê o CÓDIGO-FONTE, e não o DOM: renderizar em jsdom não diria
// dentro de qual diálogo o bloco nasceu, nem em que ordem.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const fonte = readFileSync(join(__dirname, '..', 'Clientes.tsx'), 'utf-8')

const posDialogo = fonte.indexOf('<Dialog open={dialogAberto}')
const posFimDialogo = fonte.indexOf('</Dialog>', posDialogo)
const posCnpj = fonte.indexOf('id="cnpj"')
const posBloco = fonte.indexOf('<CadastroFiscalCliente')

describe('bloco fiscal do cliente', () => {
  it('as âncoras todas existem', () => {
    // Sem isto, os testes abaixo passariam por acidente se algo fosse renomeado
    // (um indexOf que não acha devolve -1, que é menor que tudo).
    expect(posDialogo, 'não achei o Dialog do cliente').toBeGreaterThan(-1)
    expect(posFimDialogo, 'não achei o fim do Dialog do cliente').toBeGreaterThan(-1)
    expect(posCnpj, 'não achei o campo de CNPJ').toBeGreaterThan(-1)
    expect(posBloco, 'não achei <CadastroFiscalCliente').toBeGreaterThan(-1)
  })

  it('fica dentro do diálogo do cliente', () => {
    expect(posBloco).toBeGreaterThan(posDialogo)
    expect(
      posBloco,
      'o bloco fiscal caiu fora do diálogo do cliente — some da tela sem quebrar nada'
    ).toBeLessThan(posFimDialogo)
  })

  it('vem DEPOIS do campo de CNPJ, senão o botão da Receita nasce inútil', () => {
    expect(
      posBloco,
      'o bloco subiu para antes do CNPJ: o botão "Buscar na Receita" passa a pedir ' +
        'um CNPJ que o lojista ainda não teve onde digitar'
    ).toBeGreaterThan(posCnpj)
  })

  it('recebe o CNPJ digitado e devolve o que a Receita informou', () => {
    // Sem `cnpj`, o botão não tem de onde partir. Sem `onDadosDaReceita`, a
    // razão social aparece na consulta e mesmo assim precisa ser digitada.
    const bloco = fonte.slice(posBloco, fonte.indexOf('/>', posBloco))
    expect(bloco).toContain('cnpj={form.cnpj}')
    expect(bloco).toContain('onDadosDaReceita')
  })

  it('aparece uma vez só', () => {
    expect(fonte.split('<CadastroFiscalCliente').length - 1).toBe(1)
  })
})
