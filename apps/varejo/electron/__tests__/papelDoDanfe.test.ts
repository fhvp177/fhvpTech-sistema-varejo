/**
 * O DANFE da NFC-e sai na BOBINA, e não numa tira deslocada.
 *
 * ── O defeito, e por que ele enganou ────────────────────────────────────────
 * A nota saía impressa deslocada para a direita, com meio centímetro de papel
 * escrito e o resto no vazio. É o mesmo SINTOMA do comprovante de entrega, e
 * por isso a primeira suspeita foi a mesma causa — só que ali era CSS nosso
 * (`margin: 0 auto` sem `@media print`), e aqui não existe CSS nosso: o DANFE
 * vem PRONTO do provedor fiscal, com 80mm, e o layout dele é definido em lei.
 *
 * O que faltava era dizer ao Chromium em que papel imprimir. Sem `pageSize`,
 * ele monta a página no padrão dele (carta/A4) e encaixa os 80mm CENTRALIZADOS
 * numa folha de 210mm: o conteúdo começa aos 65mm da borda, a bobina acaba aos
 * 80, e sobra exatamente aquela tira.
 *
 * ── ⚠️ Por que esta guarda lê o código ──────────────────────────────────────
 * O caminho inteiro é Electron: janela oculta, viewer de PDF, driver de
 * impressora. Exercitá-lo num teste significaria simular o Chromium imprimindo
 * — e ainda assim não provaria o que importa, que é a MEDIDA que sai daqui.
 *
 * A régua de verdade continua sendo o papel: imprimir uma nota e olhar. Esta
 * guarda é o alarme barato que dispara antes de alguém gastar bobina, e ela
 * cobra as três coisas que, juntas, produziram o defeito.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FONTE = readFileSync(join(AQUI, '..', 'ipc', 'impressao.ts'), 'utf-8')

/** O arquivo sem os comentários: o texto que explica a regra contém a regra. */
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

/** O corpo do handler que imprime um PDF pronto. */
function handlerDoPdf(): string {
  const i = CODIGO.indexOf("'impressao:imprimirPdf'")
  expect(i, 'não achei o handler de PDF — a varredura quebrou').toBeGreaterThan(-1)
  const fim = CODIGO.indexOf("registrarCanal(", i + 10)
  return CODIGO.slice(i, fim > i ? fim : undefined)
}

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

  it('★ cupom imprime em 80mm de largura, em micrômetros', () => {
    /*
     * ⚠️ A unidade é a armadilha: `webContents.print()` usa MICRÔMETROS e
     * `printToPDF()`, no mesmo arquivo, usa POLEGADAS. Trocar as duas dá uma
     * página microscópica ou gigante, sem erro nenhum — e o papel só conta a
     * verdade depois.
     */
    expect(CODIGO, 'a largura da bobina saiu do mapa de papel').toMatch(
      /cupom:\s*\{\s*width:\s*80_?000\s*,/
    )
    expect(CODIGO, 'a altura virou medida de polegada no lugar de micrômetro').toMatch(
      /height:\s*297_?000\s*\}/
    )
  })

  it('★ e o papel escolhido chega mesmo às opções de impressão', () => {
    /*
     * A mutação que este teste existe para pegar: manter o mapa de papel no
     * arquivo e parar de usá-lo. O mapa continuaria certo, a leitura acima
     * passaria verde, e a nota voltaria a sair centralizada numa folha.
     */
    const handler = handlerDoPdf()
    expect(handler, 'o papel foi calculado e nunca usado').toContain('pageSize: papel')
    // Em bobina o que sobrar de branco é papel gasto, e o conteúdo precisa
    // começar encostado à esquerda.
    expect(handler, 'a margem voltou a existir na bobina').toContain("marginType: 'none'")
  })

  it('★ documento NÃO ganha papel forçado', () => {
    /*
     * O outro lado do conserto. A NF-e (modelo 55) é A4 e vai para a impressora
     * de documentos; carimbar 80mm nela transformaria a nota inteira numa
     * tirinha — o mesmo defeito, do avesso.
     */
    expect(CODIGO, 'documento passou a ter tamanho de papel forçado').toMatch(
      /documento:\s*null/
    )
  })
})
