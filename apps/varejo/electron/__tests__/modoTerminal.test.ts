/**
 * Desvio de canais no modo terminal.
 *
 * Prova a divisão de trabalho do segundo caixa: dado da loja sai pela rede,
 * hardware e assuntos da própria instalação ficam. Errar essa divisão dá dois
 * defeitos opostos e igualmente ruins — mandar impressão pela rede faz o cupom
 * sair na loja em vez de na mão do operador; executar venda localmente
 * procuraria um banco que não existe nesta máquina.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  configurarEncaminhador,
  despachar,
  limparCanais,
  registrarCanal
} from '@fhvptech/core/electron/roteador'
import { canalAtendePelaRede } from '../multicaixa/canais'

afterEach(() => {
  limparCanais()
})

/** Monta o desvio igual ao que o modo terminal instala no boot. */
function ligarDesvio(): { enviados: string[] } {
  const enviados: string[] = []
  configurarEncaminhador({
    deveEnviar: canalAtendePelaRede,
    enviar: async (canal) => {
      enviados.push(canal)
      return { success: true, data: 'veio da rede' }
    }
  })
  return { enviados }
}

describe('divisão entre rede e local', () => {
  it('manda dado da loja pela rede', async () => {
    registrarCanal('vendas:criar', () => ({ success: true, data: 'rodou local' }))
    const { enviados } = ligarDesvio()

    expect(await despachar('vendas:criar')).toEqual({ success: true, data: 'veio da rede' })
    expect(enviados).toEqual(['vendas:criar'])
  })

  it('mantém a impressão nesta máquina', async () => {
    registrarCanal('impressao:imprimir', () => ({ success: true, data: 'rodou local' }))
    const { enviados } = ligarDesvio()

    // Se isto saísse pela rede, o cupom do segundo caixa sairia na impressora
    // da loja — longe de quem está atendendo.
    expect(await despachar('impressao:imprimir')).toEqual({ success: true, data: 'rodou local' })
    expect(enviados).toEqual([])
  })

  it('mantém local a atualização e a licença desta máquina', async () => {
    registrarCanal('atualizacao:verificar', () => 'local')
    registrarCanal('licenca:validar', () => 'local')
    const { enviados } = ligarDesvio()

    expect(await despachar('atualizacao:verificar')).toBe('local')
    expect(await despachar('licenca:validar')).toBe('local')
    expect(enviados).toEqual([])
  })

  it('desviado nem chega a executar o handler local', async () => {
    let executou = false
    registrarCanal('vendas:criar', () => {
      executou = true
      return null
    })
    ligarDesvio()

    await despachar('vendas:criar')

    // Executar aqui procuraria um banco que não existe nesta máquina.
    expect(executou).toBe(false)
  })
})

describe('voltar ao normal', () => {
  it('sem desvio, tudo roda local', async () => {
    registrarCanal('vendas:criar', () => ({ success: true, data: 'rodou local' }))
    ligarDesvio()
    configurarEncaminhador(null)

    expect(await despachar('vendas:criar')).toEqual({ success: true, data: 'rodou local' })
  })

  it('o caixa principal não tem desvio nenhum', async () => {
    // Garantia de que a máquina normal segue idêntica a antes do multi-caixa:
    // sem encaminhador configurado, o roteador só conhece o caminho local.
    registrarCanal('vendas:criar', () => 'local')

    expect(await despachar('vendas:criar')).toBe('local')
  })
})
