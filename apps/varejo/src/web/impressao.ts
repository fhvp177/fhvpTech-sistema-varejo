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
 * O nome do arquivo quando o navegador salva em PDF.
 *
 * ── ⚠️ Por que mexer no título da página ────────────────────────────────────
 * O Chrome sugere o nome do PDF a partir do TÍTULO DO DOCUMENTO, e imprimindo
 * de dentro de um quadro ele usa o título da página de cima, não o do quadro.
 * Como a página de cima é o aplicativo, todo cupom, relatório e comprovante
 * saía com o mesmo nome genérico, e o lojista tinha que renomear um por um.
 *
 * Então o título vira o nome do documento pelo tempo da impressão e volta ao
 * que era. É feio, e é o único caminho: não existe API para dizer ao navegador
 * qual nome sugerir.
 *
 * ⚠️ A restauração fica em `finally` de verdade (o `recolher`, que roda tanto
 * no `afterprint` quanto no tempo limite). Se ela falhasse, a aba ficaria com o
 * nome de um cupom para sempre.
 */
function trocarTituloTemporariamente(nome: string | undefined): () => void {
  const original = document.title
  const limpo = (nome ?? '').trim()
  if (!limpo) return () => {}
  document.title = limpo
  return () => {
    document.title = original
  }
}

/**
 * Monta um quadro escondido com o conteúdo, manda imprimir e recolhe depois.
 *
 * O quadro precisa estar no documento (não `display:none`) para o navegador
 * calcular o layout — daí ficar fora da área visível em vez de escondido.
 */
async function imprimirEmQuadro(
  preencher: (quadro: HTMLIFrameElement) => void,
  nomeSugerido?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const devolverTitulo = trocarTituloTemporariamente(nomeSugerido)
    const quadro = document.createElement('iframe')
    quadro.setAttribute('aria-hidden', 'true')
    quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'

    let recolhido = false
    const recolher = (): void => {
      if (recolhido) return
      recolhido = true
      devolverTitulo()
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
  async imprimir(html: string, nome?: string): Promise<Resposta> {
    try {
      await imprimirEmQuadro((quadro) => {
        quadro.srcdoc = html
      }, nome)
      return ok(null)
    } catch (erro) {
      return falha(erro)
    }
  },

  async imprimirPdf(pdfBase64: string, nome?: string): Promise<Resposta> {
    try {
      const url = URL.createObjectURL(blobDeBase64(pdfBase64, 'application/pdf'))
      await imprimirEmQuadro((quadro) => {
        quadro.src = url
      }, nome)
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
   * Preferências, e elas NUNCA vão ao servidor.
   *
   * ⚠️ Faltar estes dois aqui era um defeito de verdade, e o dono o viu:
   * "impressão e multicaixa não abrem aqui, ficam só carregando". Sem eles a
   * chamada seguia para o servidor da loja, que não registra canal de impressão
   * nenhum (o cabeçalho dele diz, por extenso, que não imprime) — aí a chamada
   * lançava, o `.then` da tela nunca rodava e ela ficava carregando para sempre.
   *
   * ── ⚠️ `direto: true`, e o nome de impressora é FALSO de propósito ─────────
   * Isto foi visto em 11/09/2026, na loja pelo navegador: TODA impressão parava
   * numa caixa vermelha dizendo "Nenhuma impressora encontrada. Verifique se há
   * uma instalada no Windows", com o botão travado. Não havia saída.
   *
   * A causa é o desenho, não um defeito solto. A tela de impressão do sistema
   * existe para ESCOLHER a impressora antes de mandar, e uma página nunca vai
   * ter essa lista: quem conhece as impressoras é o aparelho, e ele mostra a
   * lista dele na própria caixa de impressão. Pedir para escolher aqui é pedir
   * o impossível, e a mensagem ainda falava de Windows para quem está num
   * tablet.
   *
   * "Modo direto" quer dizer "não pergunte, mande imprimir", e é exatamente o
   * certo aqui: o navegador vai abrir a caixa dele logo em seguida, e é ali que
   * a escolha acontece. O nome da impressora é ignorado por toda esta família
   * (ver o comentário no topo do objeto), então ele serve só para o modo direto
   * não cair fora por estar vazio — e para aparecer com um nome que o lojista
   * entenda se vier a ser exibido.
   */
  async obterPreferencias(): Promise<Resposta> {
    const naCaixaDoAparelho = { printer: 'Caixa de impressão do aparelho', direto: true }
    /*
     * ⚠️ `papelCaixa` fica no PADRÃO aqui, e não vai ao servidor.
     *
     * Ele é preferência da LOJA, guardada no banco, e o resto desta família
     * nunca fala com o servidor (a impressora é do aparelho, não da nuvem).
     * Abrir uma exceção só para esta chave traria o problema que este arquivo
     * existe para evitar: chamada que sai daqui, não encontra canal do outro
     * lado, e a tela fica carregando para sempre.
     *
     * O efeito prático é pequeno e aceito: na loja pelo navegador os dois
     * comprovantes saem no formato de bobina, que é o padrão. Trocar para A4
     * pela web fica para quando houver canal próprio de configuração.
     */
    return ok({
      cupom: naCaixaDoAparelho,
      documento: naCaixaDoAparelho,
      papelCaixa: 'termica'
    })
  },

  /** Nada a guardar: não há preferência que a página possa aplicar. */
  async salvarPreferencias(): Promise<Resposta> {
    return ok(null)
  },

  /**
   * "Salvar em PDF" vira o próprio salvar da caixa de impressão do sistema —
   * no Android e no Chrome ela sempre oferece "Salvar como PDF". Gerar o PDF
   * por conta própria exigiria uma biblioteca inteira para chegar num resultado
   * pior que o do navegador, que já sabe paginar o mesmo HTML.
   */
  async salvarPdf(html: string, nome?: string): Promise<Resposta> {
    try {
      await imprimirEmQuadro((quadro) => {
        quadro.srcdoc = html
      }, nome)
      return ok(null)
    } catch (erro) {
      return falha(erro)
    }
  }
}
