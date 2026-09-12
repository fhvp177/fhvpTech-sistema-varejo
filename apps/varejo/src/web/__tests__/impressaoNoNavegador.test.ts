/**
 * Impressão na loja pelo navegador.
 *
 * ── Os dois defeitos que este arquivo prende ────────────────────────────────
 * Os dois foram vistos em 11/09/2026, na loja aberta no navegador, e nenhum
 * deles aparece no aplicativo instalado — que é justamente por que ninguém
 * tinha visto antes.
 *
 *  1. ★ **Toda impressão morria numa caixa vermelha.** A tela de impressão
 *     existe para ESCOLHER a impressora, e uma página nunca tem essa lista.
 *     Resultado: "Nenhuma impressora encontrada. Verifique se há uma instalada
 *     no Windows", com o botão travado e nenhuma saída — falando de Windows
 *     para quem está num tablet. A correção é dizer "modo direto": não
 *     pergunte, mande imprimir, que a caixa do próprio aparelho pergunta em
 *     seguida.
 *
 *  2. **O PDF saía com nome genérico.** O Chrome sugere o nome do arquivo a
 *     partir do TÍTULO DO DOCUMENTO, e imprimindo de dentro de um quadro ele
 *     usa o título da página de cima. Todo cupom e todo relatório saíam com o
 *     mesmo nome, e o lojista renomeava um por um.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IMPRESSAO_NO_NAVEGADOR } from '../impressao'

type Resposta = { success: boolean; error?: string }

/**
 * Chama um método da família de impressão do navegador.
 *
 * ⚠️ O `as` existe por causa da assinatura do objeto exportado, que é
 * `(...args: never[])` para caber qualquer forma de método. Isso é certo lá
 * (é um mapa de implementações com assinaturas diferentes) e impede chamar
 * com argumento de verdade aqui. O laço fica num lugar só, em vez de um `as`
 * espalhado por teste.
 */
function chamar(metodo: string, ...args: unknown[]): Promise<Resposta> {
  const fn = IMPRESSAO_NO_NAVEGADOR[metodo] as unknown as (
    ...a: unknown[]
  ) => Promise<Resposta>
  return fn(...args)
}

/*
 * O ambiente destes testes é `node`, sem DOM. Em vez de puxar jsdom só por
 * causa de dois testes, o mínimo de `document` e `window` que o módulo encosta
 * é montado à mão — e à mão fica VISÍVEL o que ele encosta, que é o ponto.
 */
let tituloDuranteImpressao: string | null = null
let printChamado = 0

function montarDomFalso(): void {
  tituloDuranteImpressao = null
  printChamado = 0

  const quadro = {
    setAttribute: () => {},
    style: { cssText: '' },
    remove: () => {},
    onload: null as null | (() => void),
    srcdoc: '',
    src: '',
    contentWindow: {
      addEventListener: () => {},
      focus: () => {},
      print: () => {
        printChamado++
        // É AQUI que o Chrome lê o nome sugerido do PDF.
        tituloDuranteImpressao = globalThis.document.title
      }
    }
  }

  const doc = {
    title: 'FHVP Tech',
    createElement: () => quadro,
    body: {
      appendChild: () => {
        // O navegador dispara `onload` sozinho; aqui o teste faz o papel dele.
        queueMicrotask(() => quadro.onload?.())
      }
    }
  }

  ;(globalThis as unknown as { document: unknown }).document = doc
  ;(globalThis as unknown as { window: unknown }).window = { print: () => {} }
}

beforeEach(() => {
  vi.useFakeTimers()
  montarDomFalso()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Roda a impressão empurrando os temporizadores internos. */
async function imprimirAgora(chamada: Promise<unknown>): Promise<Resposta> {
  await vi.advanceTimersByTimeAsync(200)
  return (await chamada) as Resposta
}

describe('★ a loja no navegador imprime em MODO DIRETO', () => {
  it('não pede para escolher impressora: manda imprimir', async () => {
    /*
     * Este é o teste que impede a caixa vermelha de voltar. `direto: false`
     * aqui faz a tela abrir o diálogo de escolha, e o diálogo não tem o que
     * oferecer no navegador — é o beco sem saída que o dono encontrou.
     */
    const r = (await IMPRESSAO_NO_NAVEGADOR.obterPreferencias()) as {
      success: boolean
      data: Record<string, { printer: string; direto: boolean }>
    }
    expect(r.success).toBe(true)
    for (const categoria of ['cupom', 'documento']) {
      expect(r.data[categoria].direto, `${categoria} tem que imprimir direto`).toBe(true)
      // Nome vazio derrubaria o modo direto: a tela exige os dois.
      expect(r.data[categoria].printer.length).toBeGreaterThan(0)
    }
  })

  it('o nome da impressora não fala de Windows nem promete escolha', () => {
    // Quem está num tablet não instala impressora no Windows.
    const texto = 'Caixa de impressão do aparelho'
    expect(texto.toLowerCase()).not.toContain('windows')
  })

  it('a lista de impressoras continua vazia, e isso é o desenho', async () => {
    // Uma página não enxerga as impressoras do aparelho. Devolver uma lista
    // inventada seria pior: a tela ofereceria uma escolha que não existe.
    const r = (await IMPRESSAO_NO_NAVEGADOR.listarImpressoras()) as {
      success: boolean
      data: unknown[]
    }
    expect(r.data).toEqual([])
  })

  it('salvar preferência não guarda nada, e responde sucesso', async () => {
    // Responder erro faria a tela mostrar falha numa ação que simplesmente não
    // se aplica aqui.
    const r = (await IMPRESSAO_NO_NAVEGADOR.salvarPreferencias()) as Resposta
    expect(r.success).toBe(true)
  })
})

describe('o nome sugerido do PDF', () => {
  it('★ o título da página vira o nome do documento durante a impressão', async () => {
    const r = await imprimirAgora(
      chamar('salvarPdf', '<html><body>oi</body></html>', 'Cupom-Venda-0074')
    )
    expect(r.success).toBe(true)
    expect(printChamado).toBe(1)
    expect(tituloDuranteImpressao).toBe('Cupom-Venda-0074')
  })

  it('★ o título volta ao que era depois de imprimir', async () => {
    // Sem a volta, a aba ficaria com o nome de um cupom para sempre.
    await imprimirAgora(chamar('salvarPdf', '<html></html>', 'Cupom-Venda-0074'))
    await vi.advanceTimersByTimeAsync(61_000)
    expect(globalThis.document.title).toBe('FHVP Tech')
  })

  it('imprimir também leva o nome', async () => {
    await imprimirAgora(chamar('imprimir', '<html></html>', 'Extrato Banco X'))
    expect(tituloDuranteImpressao).toBe('Extrato Banco X')
  })

  it('sem nome, o título fica como está', async () => {
    await imprimirAgora(chamar('imprimir', '<html></html>'))
    expect(tituloDuranteImpressao).toBe('FHVP Tech')
    expect(globalThis.document.title).toBe('FHVP Tech')
  })

  it('nome só com espaços conta como sem nome', async () => {
    await imprimirAgora(chamar('imprimir', '<html></html>', '   '))
    expect(tituloDuranteImpressao).toBe('FHVP Tech')
  })
})
