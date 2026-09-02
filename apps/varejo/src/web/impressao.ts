/**
 * Imprimir a partir do navegador.
 *
 * ── Por que isto não vai para o servidor ─────────────────────────────────────
 * O servidor da loja roda numa máquina virtual em São Paulo. Impressora ligada
 * nele não existe, e se existisse o cupom sairia lá. Quem tem a impressora do
 * balcão é o tablet — então impressão é das poucas coisas que o navegador
 * responde sozinho, sem falar com o servidor.
 *
 * É exatamente a mesma decisão do segundo caixa, que também imprime na
 * impressora DELE e não na do PC da loja (ver multicaixa/canais.ts).
 *
 * ── O caminho até o papel ────────────────────────────────────────────────────
 * O cupom já chega pronto: a tela monta o HTML, com as medidas de 72mm e o QR
 * do PIX embutidos, e no app instalado o Electron só manda o Chromium imprimir.
 * Aqui é o mesmo HTML, num quadro escondido, e o `print()` do navegador.
 *
 * No Android, esse `print()` abre a caixa de impressão do sistema. Com um app
 * de serviço ESC/POS instalado, a impressora térmica Bluetooth aparece na
 * lista como qualquer outra. O lojista escolhe uma vez e o Android lembra.
 *
 * ── O que se perde, e é bom saber ────────────────────────────────────────────
 * A impressão silenciosa. No PC, com "modo direto" ligado, o cupom sai sem
 * perguntar nada. Aqui a caixa do Android sempre aparece: um toque a mais por
 * venda. Numa joalheria, com poucas vendas de valor alto, isso não pesa; num
 * mercado com 300 vendas ao dia, pesaria.
 */

type Resposta<T = unknown> = { success: true; data: T } | { success: false; error: string }

/** Quanto esperar o conteúdo assentar antes de mandar imprimir. */
const ESPERA_RENDER_MS = 150
/** Quanto esperar antes de recolher o quadro, quando o navegador não avisa. */
const ESPERA_LIMPEZA_MS = 60_000

/**
 * Monta um quadro escondido com o conteúdo, manda imprimir e recolhe depois.
 *
 * O quadro precisa estar no documento (não `display:none`) para o navegador
 * calcular o layout — daí ficar fora da área visível em vez de escondido.
 */
async function imprimirEmQuadro(preencher: (quadro: HTMLIFrameElement) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const quadro = document.createElement('iframe')
    quadro.setAttribute('aria-hidden', 'true')
    quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'

    let recolhido = false
    const recolher = (): void => {
      if (recolhido) return
      recolhido = true
      quadro.remove()
    }

    quadro.onload = () => {
      const janela = quadro.contentWindow
      if (!janela) {
        recolher()
        reject(new Error('Não foi possível preparar a impressão.'))
        return
      }

      // `afterprint` chega quando o usuário confirma OU cancela — os dois casos
      // pedem a mesma limpeza, e nenhum dos dois é erro.
      janela.addEventListener('afterprint', recolher)
      // Rede de segurança: nem todo navegador de tablet dispara `afterprint`.
      // Sem isto, um quadro ficaria no documento a cada cupom impresso.
      setTimeout(recolher, ESPERA_LIMPEZA_MS)

      setTimeout(() => {
        try {
          janela.focus()
          janela.print()
          resolve()
        } catch (erro) {
          recolher()
          reject(erro as Error)
        }
      }, ESPERA_RENDER_MS)
    }

    document.body.appendChild(quadro)
    preencher(quadro)
  })
}

function ok<T>(data: T): Resposta<T> {
  return { success: true, data }
}

function falha(erro: unknown): Resposta<never> {
  return { success: false, error: (erro as Error).message ?? 'Falha ao imprimir.' }
}

/** Base64 → Blob, para o DANFE que chega pronto do provedor fiscal. */
function blobDeBase64(base64: string, tipo: string): Blob {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/**
 * As implementações de `window.api.impressao.*` que rodam aqui mesmo.
 *
 * O `deviceName` de cada assinatura é ignorado de propósito: no app instalado
 * ele escolhe a impressora sem perguntar; aqui quem escolhe é a caixa de
 * impressão do sistema. Manter o parâmetro deixa a tela idêntica nos dois
 * lugares — ela não precisa saber onde está rodando.
 */
export const IMPRESSAO_NO_NAVEGADOR: Record<string, (...args: never[]) => Promise<Resposta>> = {
  async imprimir(html: string): Promise<Resposta> {
    try {
      await imprimirEmQuadro((quadro) => {
        quadro.srcdoc = html
      })
      return ok(null)
    } catch (erro) {
      return falha(erro)
    }
  },

  async imprimirPdf(pdfBase64: string): Promise<Resposta> {
    try {
      const url = URL.createObjectURL(blobDeBase64(pdfBase64, 'application/pdf'))
      await imprimirEmQuadro((quadro) => {
        quadro.src = url
      })
      // Só depois de o quadro ter carregado; revogar antes deixaria o PDF vazio.
      setTimeout(() => URL.revokeObjectURL(url), ESPERA_LIMPEZA_MS)
      return ok(null)
    } catch (erro) {
      return falha(erro)
    }
  },

  async imprimirJanela(): Promise<Resposta> {
    try {
      window.print()
      return ok(null)
    } catch (erro) {
      return falha(erro)
    }
  },

  /**
   * Lista vazia, sempre.
   *
   * Uma página não enxerga as impressoras do aparelho — e não é limitação a
   * contornar, é o desenho: quem conhece as impressoras é o sistema, e ele já
   * mostra a lista dele na caixa de impressão. Devolver vazio faz a tela cair
   * no caminho de "escolher na hora", que é o certo aqui.
   */
  async listarImpressoras(): Promise<Resposta> {
    return ok([])
  },

  /**
   * "Salvar em PDF" vira o próprio salvar da caixa de impressão do sistema —
   * no Android e no Chrome ela sempre oferece "Salvar como PDF". Gerar o PDF
   * por conta própria exigiria uma biblioteca inteira para chegar num resultado
   * pior que o do navegador, que já sabe paginar o mesmo HTML.
   */
  async salvarPdf(html: string): Promise<Resposta> {
    try {
      await imprimirEmQuadro((quadro) => {
        quadro.srcdoc = html
      })
      return ok(null)
    } catch (erro) {
      return falha(erro)
    }
  }
}
