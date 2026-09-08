/*
 * Portado do varejo (os dois primeiros pedidos do Neto Imports, 06/09/2026).
 *
 * Os dois são a MESMA lição, e é por isso que moram no mesmo arquivo: um campo
 * que existe mas ninguém acha é um campo que não existe.
 *
 * ── O que aconteceu ──────────────────────────────────────────────────────────
 * O lojista pediu "venda com sinal" e descreveu o contorno que inventou: criava
 * uma venda parcelada, marcava a 1ª parcela como paga, e quando o cliente
 * voltasse à loja baixava a 2ª.
 *
 * Só que o sistema já fazia isso desde sempre, no campo "Entrada", que abate do
 * valor devido e entra como `valor_pago`. Ele nunca viu porque o campo só
 * aparece depois de sair do "À vista" — e nada na tela dizia que dava para
 * receber só uma parte.
 *
 * A correção não foi mecânica nenhuma: foi dizer, no momento da ESCOLHA, o que
 * cada condição de pagamento faz, usando a palavra que ele usa ("sinal").
 *
 * E o cadastro rápido de cliente ganhou endereço e observação À VISTA, sem
 * "mais dados" para clicar, pela mesma razão.
 *
 * Numa assistência o sinal é o caso COMUM, e não o raro: o cliente deixa o
 * aparelho, adianta parte para a peça ser comprada e paga o resto na retirada.
 *
 * A varredura é estrutural de propósito: o defeito não é de comportamento (o
 * campo sempre funcionou), é de o texto certo estar no lugar certo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = join(AQUI, '..', '..')
const VENDAS = readFileSync(join(SRC, 'pages', 'Vendas.tsx'), 'utf8')
const CUPOM = readFileSync(join(SRC, 'utils', 'cupomVenda.ts'), 'utf8')

describe('o sinal deixa de ser invisível', () => {
  it('★ cada condição de pagamento diz o que faz, no momento da escolha', () => {
    /*
     * ⚠️ É AQUI que a descoberta acontece. Explicar o sinal só depois de a
     * pessoa já ter escolhido "À vista" não adianta: nesse modo o campo nem
     * existe, e ela não tem motivo para desconfiar que existe outro caminho.
     */
    expect(VENDAS).toContain('const AJUDA_CONDICAO_PAGAMENTO')
    expect(VENDAS, 'a condição "à vista" não explica que recebe tudo agora')
      .toContain("pago: 'Recebe tudo agora'")
    // as duas condições que aceitam sinal precisam dizer a PALAVRA
    for (const chave of ['pendente', 'parcelado']) {
      // ⚠️ Sem baixar a caixa a comparação falha: o texto começa com "Sinal".
      const linha = VENDAS.split('\n').find(
        (l) => l.trim().startsWith(`${chave}: '`) && l.toLowerCase().includes('sinal')
      )
      expect(linha, `a condição "${chave}" não menciona o sinal`).toBeTruthy()
    }
    /*
     * E o texto tem que estar RENDERIZADO, não só declarado.
     *
     * ⚠️ A primeira versão desta guarda procurava só `{AJUDA_CONDICAO_PAGAMENTO[s]}`
     * e SOBREVIVEU à mutação que trocava a condição por `{false && (`: o texto
     * continuava escrito no arquivo, dentro de um bloco que nunca desenha. O
     * defeito original voltava inteiro e o teste seguia verde. Por isso a
     * condição e o desenho são cobrados JUNTOS, como um pedaço só.
     */
    expect(VENDAS, 'a ajuda foi declarada e nunca desenhada').toContain(
      '{AJUDA_CONDICAO_PAGAMENTO[s] && ('
    )
    expect(VENDAS).toContain('{AJUDA_CONDICAO_PAGAMENTO[s]}')
  })

  it('★ o campo usa a palavra do lojista, e o cupom concorda', () => {
    /*
     * "Sinal" é a palavra dele; "entrada" é a do comércio e a que já saía
     * impressa. Renomear só na tela faria o papel e o sistema discordarem na
     * frente do cliente.
     */
    expect(VENDAS).toContain('Sinal <span className="text-muted-foreground">(entrada, opcional)</span>')
    expect(VENDAS).toContain('<span className="font-medium text-foreground">Sinal pago: </span>')
    expect(CUPOM, 'o cupom voltou a chamar de entrada e discorda da tela')
      .toContain('<span>Sinal pago:</span>')
  })

  it('★ o campo continua fora do "à vista", onde não há o que abater', () => {
    /*
     * Não é para mostrar sempre: numa venda à vista o cliente paga tudo, e um
     * campo de sinal ali só faria perguntar uma coisa cuja resposta já se sabe.
     *
     * ⚠️ A condição é cobrada COLADA no campo dela. Solta, a mesma string
     * aparece em outros pontos da tela, e a guarda sobrevivia à mutação que
     * abria o campo no "à vista" — porque o texto continuava existindo noutro
     * lugar qualquer do arquivo.
     */
    const antesDoCampo = VENDAS.slice(
      Math.max(0, VENDAS.indexOf('<Label htmlFor="entrada"') - 300),
      VENDAS.indexOf('<Label htmlFor="entrada"')
    )
    expect(antesDoCampo.length, 'a fatia ficou vazia — a varredura quebrou').toBeGreaterThan(50)
    expect(antesDoCampo, 'o campo de sinal passou a aparecer também na venda à vista')
      .toContain("{statusPagamento !== 'pago' && (")
  })
})

describe('cadastro rápido de cliente: endereço e observação', () => {
  it('★ os dois campos chegam ao banco, e vazio vira NULL', () => {
    /*
     * A chamada passava `endereco: null` e `observacao: null` escritos na mão.
     *
     * ⚠️ E vazio grava NULL, não string vazia: quem lê depois pergunta "este
     * cliente tem endereço?", e `''` responderia que sim — o que faz a tela de
     * entrega mostrar um destino em branco em vez de avisar que falta.
     */
    expect(VENDAS).toContain('endereco: enderecoClienteRapido.trim() || null')
    expect(VENDAS).toContain('observacao: observacaoClienteRapido.trim() || null')
    expect(VENDAS, 'voltou a gravar null escrito na mão').not.toContain('      endereco: null,')
  })

  it('★ os campos ficam à VISTA, não atrás de um "mais dados"', () => {
    /*
     * ⚠️ Esta guarda existe por causa do defeito do sinal, no mesmo dia: um
     * campo que só aparece depois de um clique extra é um campo que o lojista
     * não vai achar. Se alguém for "limpar" o cadastro rápido escondendo estes
     * dois, encontra este teste vermelho e este comentário.
     */
    expect(VENDAS).toContain('id="endereco-cliente-rapido"')
    expect(VENDAS).toContain('id="observacao-cliente-rapido"')
    const dialogo = VENDAS.slice(
      VENDAS.indexOf('Cadastro Rápido de Cliente'),
      VENDAS.indexOf('Cadastro Rápido de Produto')
    )
    expect(dialogo.length, 'a fatia do diálogo ficou vazia — a varredura quebrou')
      .toBeGreaterThan(500)
    /*
     * ⚠️ A guarda é sobre ESTADO que esconde, não sobre a palavra. A primeira
     * versão procurava /toggle/i e casava com o comentário "Toggle PF/PJ", que
     * já existia ali e não esconde nada. O que denunciaria um recolhimento é
     * uma variável de estado nova governando os campos.
     */
    expect(dialogo, 'os campos saíram do diálogo').toContain('endereco-cliente-rapido')
    expect(VENDAS, 'apareceu estado que recolhe campos do cadastro rápido')
      .not.toMatch(/(maisDados|mostrarMais|camposExtras|expandido)[A-Za-z]*\s*,\s*set/)
  })

  it('★ o endereço se explica pela entrega', () => {
    // Não é campo pedido por pedir: é por ele que o aparelho volta para o
    // cliente, e é o que uma mensagem de "está pronto" pressupõe.
    expect(VENDAS).toContain('para entrega')
  })
})
