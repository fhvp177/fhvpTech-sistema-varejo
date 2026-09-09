/**
 * O DANFE da NFC-e sai na BOBINA — inteiro, e não numa tira deslocada.
 *
 * ── O defeito, e por que ele enganou ────────────────────────────────────────
 * A nota saía impressa deslocada para a direita, com meio centímetro de papel
 * escrito e o resto no vazio. É o mesmo SINTOMA do comprovante de entrega, e
 * por isso a primeira suspeita foi a mesma causa — só que ali era CSS nosso
 * (`margin: 0 auto` sem `@media print`), e aqui não existe CSS nosso: o DANFE
 * vem PRONTO do provedor fiscal, e o layout dele é definido em lei.
 *
 * O que faltava era dizer ao Chromium em que papel imprimir. Sem `pageSize`,
 * ele monta a página no padrão dele (carta/A4) e encaixa a nota CENTRALIZADA
 * numa folha de 210mm: o conteúdo começa aos 65mm da borda, a bobina acaba aos
 * 80, e sobra exatamente aquela tira.
 *
 * ── ⚠️ E o pedaço que ainda faltava ─────────────────────────────────────────
 * Com a página de 80mm a nota voltou pro lugar e continuou cortada na direita:
 * sumiam a coluna de VL TOTAL, o valor a pagar, o valor pago, o troco e o
 * último dígito da chave de acesso. 80mm é a largura da BOBINA; a cabeça
 * térmica escreve 72. Pedindo 80 ao provedor, ele monta 76mm de conteúdo (2mm
 * de margem de cada lado) e os 4mm finais são impressos no ar.
 *
 * A cura tem duas metades que só funcionam JUNTAS: pedir o DANFE já na largura
 * impressa e imprimir numa página do mesmo tamanho. Se as duas divergirem, a
 * nota é centralizada de novo e volta a sair cortada — por isso as duas medidas
 * saem da mesma função.
 *
 * ── ⚠️ Por que parte desta guarda lê o código ───────────────────────────────
 * O caminho da impressão é Electron: janela oculta, viewer de PDF, driver de
 * impressora. Exercitá-lo num teste significaria simular o Chromium imprimindo
 * — e ainda assim não provaria o que importa, que é a MEDIDA que sai daqui.
 *
 * A régua de verdade continua sendo o papel: imprimir uma nota e olhar. Esta
 * guarda é o alarme barato que dispara antes de alguém gastar bobina.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FONTE = readFileSync(join(AQUI, '..', 'ipc', 'impressao.ts'), 'utf-8')
const FONTE_FISCAL = readFileSync(join(AQUI, '..', 'ipc', 'fiscal.ts'), 'utf-8')

/** O arquivo sem os comentários: o texto que explica a regra contém a regra. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}
const CODIGO = semComentarios(FONTE)
const CODIGO_FISCAL = semComentarios(FONTE_FISCAL)

/*
 * A configuração da loja mora no SQLite, e o módulo que a lê carrega o
 * better-sqlite3 — addon nativo compilado pro Electron, que não sobe no runtime
 * dos testes. Mesmo dublê usado em sessao.test.ts.
 */
const config = new Map<string, string>()
vi.mock('@fhvptech/core/electron/backup/configBackup', () => ({
  lerConfig: (chave: string) => config.get(chave) ?? ''
}))

const { larguraDoDanfeMm, larguraImpressaMm } = await import(
  '@fhvptech/core/electron/impressao/larguraImpressa'
)

/** O corpo do handler que imprime um PDF pronto. */
function handlerDoPdf(): string {
  const i = CODIGO.indexOf("'impressao:imprimirPdf'")
  expect(i, 'não achei o handler de PDF — a varredura quebrou').toBeGreaterThan(-1)
  const fim = CODIGO.indexOf('registrarCanal(', i + 10)
  return CODIGO.slice(i, fim > i ? fim : undefined)
}

describe('a largura que a cabeça térmica alcança', () => {
  it('★ bobina de 80mm pede DANFE de 72mm, não de 80', () => {
    /*
     * O número que conserta o corte. Voltar a 80 aqui é reencenar o defeito:
     * o provedor monta 76mm de conteúdo e os últimos 4mm — a coluna inteira de
     * valores — saem fora do papel.
     */
    config.set('fiscal_largura_bobina', '80')
    expect(larguraDoDanfeMm(), 'o DANFE voltou a ser pedido na largura da bobina').toBe(72)
  })

  it('bobina estreita de 58mm pede 48mm', () => {
    config.set('fiscal_largura_bobina', '58')
    expect(larguraDoDanfeMm()).toBe(48)
  })

  it('loja que nunca escolheu bobina cai na de 80mm', () => {
    // Config vazia é o caso de toda loja que só usa a impressora padrão.
    config.delete('fiscal_largura_bobina')
    expect(larguraDoDanfeMm()).toBe(72)
  })

  it('bobina desconhecida não devolve a própria medida', () => {
    // Nenhum papel imprime a largura inteira; na dúvida, vale a de 80mm.
    expect(larguraImpressaMm(76)).toBe(72)
  })
})

describe('o DANFE sai no papel certo', () => {
  it('★ a impressão de PDF sabe em que categoria está', () => {
    /*
     * O handler recebia só o arquivo, o nome e a impressora. Sem saber se
     * aquilo é bobina ou folha, não havia como escolher o papel — e o padrão
     * do Chromium é folha.
     */
    expect(handlerDoPdf(), 'o handler de PDF voltou a imprimir sem saber a categoria').toMatch(
      /categoria: CategoriaImpressao/
    )
  })

  it('★ a página do cupom mede a largura impressa, em micrômetros', () => {
    /*
     * ⚠️ Duas armadilhas moram nesta linha.
     *
     * A unidade: `webContents.print()` usa MICRÔMETROS e `printToPDF()`, no
     * mesmo arquivo, usa POLEGADAS. Trocar as duas dá uma página microscópica
     * ou gigante, sem erro nenhum — e o papel só conta a verdade depois.
     *
     * E a medida: ela precisa vir da MESMA função que pede o PDF ao provedor.
     * Um número escrito à mão aqui volta a divergir do PDF, e página maior que
     * o PDF centraliza a nota e corta o outro lado.
     */
    expect(CODIGO, 'a largura da página do cupom deixou de ser a largura impressa').toMatch(
      /width:\s*larguraDoDanfeMm\(\)\s*\*\s*1000/
    )
    expect(CODIGO, 'a altura virou medida de polegada no lugar de micrômetro').toMatch(
      /height:\s*297_?000\s*\}/
    )
  })

  it('★ e o papel escolhido chega mesmo às opções de impressão', () => {
    /*
     * A mutação que este teste existe para pegar: calcular o papel e parar de
     * usá-lo. A leitura acima passaria verde e a nota voltaria a sair
     * centralizada numa folha.
     */
    const handler = handlerDoPdf()
    expect(handler, 'o papel foi calculado e nunca usado').toContain('pageSize: papel')
    // Em bobina o que sobrar de branco é papel gasto, e o conteúdo precisa
    // começar encostado à esquerda.
    expect(handler, 'a margem voltou a existir na bobina').toContain("marginType: 'none'")
  })

  it('★ o PDF é pedido ao provedor na mesma medida em que é impresso', () => {
    /*
     * A outra metade da cura, e a que ninguém vê quebrar: se `fiscal.ts` pedir
     * 80mm enquanto a impressão usa 72, o PDF é maior que a página, o Chromium
     * centraliza, e some um pedaço de cada lado. As duas medidas têm que sair
     * da mesma função.
     */
    const i = CODIGO_FISCAL.indexOf("'fiscal:danfe'")
    expect(i, 'não achei o handler do DANFE — a varredura quebrou').toBeGreaterThan(-1)
    const handler = CODIGO_FISCAL.slice(i, i + 1200)
    expect(handler, 'o DANFE voltou a ser pedido numa largura própria').toContain(
      'larguraDoDanfeMm()'
    )
    expect(handler, 'a largura calculada não chega mais na URL do provedor').toMatch(
      /largura=\$\{largura\}/
    )
  })

  it('★ documento NÃO ganha papel forçado', () => {
    /*
     * O outro lado do conserto. A NF-e (modelo 55) é A4 e vai para a impressora
     * de documentos; carimbar a bobina nela transformaria a nota inteira numa
     * tirinha — o mesmo defeito, do avesso.
     */
    expect(CODIGO, 'documento passou a ter tamanho de papel forçado').toMatch(
      /categoria === 'documento'\) return null/
    )
  })
})
