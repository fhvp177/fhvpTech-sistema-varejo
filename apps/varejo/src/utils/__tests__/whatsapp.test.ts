/**
 * Chamar o cliente no WhatsApp a partir de um pedido separado.
 *
 * O que este teste protege é um erro que não parece erro: "dar um jeito" num
 * telefone incompleto. Um número curto completado na marra abre uma conversa
 * com um desconhecido, e quem manda a mensagem é o lojista, com o nome da loja
 * dele em cima.
 */
import { describe, expect, it } from 'vitest'
import { telefoneWhatsApp, mensagemPedidoSeparado, linkWhatsApp } from '../whatsapp'

describe('o telefone que o WhatsApp entende', () => {
  it('celular com DDD ganha o 55 na frente', () => {
    expect(telefoneWhatsApp('(88) 9.9999-9999')).toBe('5588999999999')
  })

  it('fixo de 10 dígitos também vale', () => {
    // Cadastro antigo, de antes do nono dígito. Continua sendo um número real.
    expect(telefoneWhatsApp('(82) 3333-4444')).toBe('558233334444')
  })

  it('número que já vem com o país não ganha outro 55', () => {
    // ⚠️ Sem esta guarda, o "55" seria colado de novo e o link viraria
    // 5555889… — um número que não existe, e o erro só apareceria na tela do
    // WhatsApp, depois de o lojista já ter clicado.
    expect(telefoneWhatsApp('5588999999999')).toBe('5588999999999')
  })

  it('★ número curto demais devolve null, e não um palpite', () => {
    /*
     * Cadastro incompleto é comum. O que não pode acontecer é o sistema
     * inventar os dígitos que faltam: abriria uma conversa com um estranho,
     * assinada com o nome da loja.
     */
    for (const ruim of ['', null, undefined, '999', '9999-9999']) {
      expect(telefoneWhatsApp(ruim), `aceitou "${ruim}"`).toBeNull()
    }
  })

  it('★ número comprido demais também é recusado', () => {
    /*
     * ⚠️ Este caso faltava, e a falta era invisível: os números curtos param na
     * primeira checagem, então o `return null` do fim ficava sem nenhum teste
     * passando por ele. Trocá-lo por "cola um 55 e manda" não fazia teste
     * nenhum ficar vermelho — descoberto por mutação.
     *
     * Quem cai aqui é dedo escorregado no cadastro: dígitos a mais, ou um
     * número de 12 casas que não é brasileiro.
     */
    expect(telefoneWhatsApp('881234567890'), 'aceitou 12 dígitos sem o 55').toBeNull()
    expect(telefoneWhatsApp('12345678901234'), 'aceitou 14 dígitos').toBeNull()
  })

  it('ignora a máscara e fica só com os dígitos', () => {
    expect(telefoneWhatsApp('+55 (88) 9 9999-9999')).toBe('5588999999999')
  })
})

describe('a mensagem pronta', () => {
  it('trata o cliente pelo primeiro nome', () => {
    const m = mensagemPedidoSeparado({
      cliente: 'Maria Aparecida da Silva',
      loja: 'Neto Imports',
      total: 'R$ 1.200,00',
      paraEntrega: false
    })
    expect(m).toContain('Olá, Maria!')
    expect(m).toContain('Neto Imports')
    expect(m).toContain('R$ 1.200,00')
  })

  it('sem cliente, não sai um "Olá, !"', () => {
    const m = mensagemPedidoSeparado({ cliente: null, loja: 'Loja', total: 'R$ 10,00', paraEntrega: false })
    expect(m).toMatch(/^Olá! /)
  })

  it('★ entrega e retirada terminam diferente', () => {
    // Mandar "pode retirar" para quem está esperando em casa é o tipo de erro
    // que o cliente percebe e o lojista não.
    const entrega = mensagemPedidoSeparado({ cliente: 'Ana', loja: 'L', total: 'R$ 1,00', paraEntrega: true })
    const retirada = mensagemPedidoSeparado({ cliente: 'Ana', loja: 'L', total: 'R$ 1,00', paraEntrega: false })
    expect(entrega).toContain('entrega')
    expect(retirada).toContain('retirado')
    expect(entrega).not.toBe(retirada)
  })
})

describe('o link', () => {
  it('leva o texto codificado', () => {
    const link = linkWhatsApp('(88) 9.9999-9999', 'Olá, Maria! Tudo bem?')
    expect(link).toContain('https://wa.me/5588999999999?text=')
    expect(link).toContain(encodeURIComponent('Olá, Maria! Tudo bem?'))
  })

  it('sem telefone válido não há link', () => {
    expect(linkWhatsApp('123', 'oi')).toBeNull()
  })
})
