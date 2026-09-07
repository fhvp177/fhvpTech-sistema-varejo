/**
 * Em qual gaveta o dinheiro cai quando o aparelho ainda não escolheu.
 *
 * ── O defeito real que originou este arquivo ────────────────────────────────
 * O cliente abriu o caixa de madrugada, no computador dele, e deixou aberto. De
 * manhã o lojista foi vender por OUTRO aparelho e o PDV recusou: "nenhum caixa
 * aberto", com o caixa aberto o tempo todo.
 *
 * A escolha do caixa é do APARELHO e mora no navegador. O segundo aparelho não
 * tinha escolha gravada, e a tela de bloqueio só oferecia o seletor quando
 * havia mais de um caixa — numa loja com um caixa só, não havia nada para
 * clicar. O botão que sobrava levava ao Caixa, que recusa abrir o que já está
 * aberto. Beco sem saída, com a loja sem poder vender.
 *
 * ── ⚠️ Por que a regra é conservadora ───────────────────────────────────────
 * Adotar o caixa errado NÃO dá erro. Faz o dinheiro entrar numa gaveta e ser
 * contado na outra, e as duas contagens fecham erradas no fim do dia — uma
 * sobrando e a outra faltando, sem nada que explique. Por isso a adoção só
 * acontece quando não existe outra gaveta para confundir; havendo dúvida, a
 * tela pergunta.
 */
import { describe, expect, it } from 'vitest'
// Caminho relativo: o vitest deste app não configura o atalho `@/`, e as
// outras guardas desta pasta leem o fonte como texto em vez de importar.
import { caixaParaAdotar } from '../../hooks/useCaixaDoAparelho'

/** Um caixa aberto tem turno; um fechado tem `turno: null`. */
const aberto = (id: number) => ({ id, turno: { id: id * 10 } })
const fechado = (id: number) => ({ id, turno: null })

describe('o aparelho que ainda não escolheu caixa', () => {
  it('★ adota o único caixa ABERTO da loja', () => {
    // O caso do defeito: caixa aberto de madrugada em outro aparelho, e este
    // aqui precisa vender de manhã.
    expect(caixaParaAdotar([aberto(1)], null)).toBe(1)
  })

  it('★ adota quando a loja tem um caixa só, mesmo fechado', () => {
    /*
     * Aqui a venda continua barrada — mas pelo motivo CERTO, e com a saída
     * certa: a tela passa a dizer "abra o caixa" em vez de "escolha o caixa",
     * que é uma escolha entre uma opção.
     */
    expect(caixaParaAdotar([fechado(1)], null)).toBe(1)
  })

  it('adota o único aberto mesmo havendo outros fechados', () => {
    // Não há dúvida: só uma gaveta está recebendo dinheiro agora.
    expect(caixaParaAdotar([fechado(1), aberto(2), fechado(3)], null)).toBe(2)
  })

  it('★ NÃO adota com dois caixas abertos — aí a escolha importa', () => {
    /*
     * O caso em que chutar custa dinheiro. Com Caixa 1 e Caixa 2 operando ao
     * mesmo tempo, escolher por conta própria jogaria as vendas deste aparelho
     * numa gaveta que pode não ser a dele.
     */
    expect(caixaParaAdotar([aberto(1), aberto(2)], null)).toBeNull()
  })

  it('não adota nada quando a loja não tem caixa cadastrado', () => {
    expect(caixaParaAdotar([], null)).toBeNull()
  })

  it('★ não adota com vários caixas fechados', () => {
    // Vai ter que abrir um, e qual abrir é decisão de quem está no balcão.
    expect(caixaParaAdotar([fechado(1), fechado(2)], null)).toBeNull()
  })
})

describe('o aparelho que JÁ escolheu', () => {
  it('★ não muda de gaveta sozinho, nem quando outro caixa abre', () => {
    /*
     * A escolha gravada sempre vence. Sem isto, abrir o Caixa 2 puxaria para
     * ele o aparelho que estava no Caixa 1 — e o vendedor continuaria no mesmo
     * balcão, com o dinheiro passando a ser contado na gaveta do vizinho.
     */
    expect(caixaParaAdotar([aberto(1), aberto(2)], 1)).toBeNull()
    expect(caixaParaAdotar([aberto(2)], 1)).toBeNull()
  })

  it('não readota nem quando o caixa escolhido está fechado', () => {
    // Fechado é motivo para a tela mandar abrir, não para trocar de gaveta.
    expect(caixaParaAdotar([fechado(1), aberto(2)], 1)).toBeNull()
  })
})
