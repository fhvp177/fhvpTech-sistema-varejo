import { BrowserWindow, dialog } from 'electron'
import { carregarJanelaImpressao } from '@fhvptech/core/electron/impressao/janelaOculta'
import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { larguraDoDanfeMm } from '@fhvptech/core/electron/impressao/larguraImpressa'

type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

// Preferência de impressora por TIPO de documento, persistida na tabela `config`
// (sem migration). `printer` = impressora preferida (lembrada/pré-selecionada);
// `direto` = imprime sem abrir o diálogo. Categorias: 'cupom' (recibos térmicos)
// e 'documento' (relatórios + etiquetas A4).
type CategoriaImpressao = 'cupom' | 'documento'

function lerPrefImpressora(cat: CategoriaImpressao): { printer: string; direto: boolean } {
  return {
    printer: lerConfig(`impressora_${cat}`) || '',
    direto: lerConfig(`impressora_${cat}_direto`) === '1'
  }
}

/**
 * Em que papel saem os comprovantes de abertura e fechamento de caixa.
 *
 * ⚠️ O padrão é a TÉRMICA, e o padrão é a decisão: a impressora que existe ao
 * lado de um caixa é a de bobina. A de folha costuma estar no escritório, ou
 * não existir. Quem quiser A4 escolhe em Configurações.
 *
 * ⚠️ Valor desconhecido cai em 'termica' em vez de lançar. É preferência de
 * papel: errar para o padrão imprime num formato inesperado, e errar para o
 * erro deixa o operador sem o comprovante no fim do turno.
 */
export type PapelCaixa = 'termica' | 'a4'

function lerPapelCaixa(): PapelCaixa {
  return lerConfig('papel_caixa') === 'a4' ? 'a4' : 'termica'
}

// Tira do nome o que o Windows não aceita em nome de arquivo.
function nomeSeguro(nome: string): string {
  return nome.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'documento'
}

// Carrega o HTML num BrowserWindow oculto e devolve a janela pronta pra imprimir.
async function carregarHtmlOculto(html: string, nomeBase: string): Promise<BrowserWindow> {
  const base = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_')
  const tmpPath = join(tmpdir(), `${base}-${Date.now()}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  return carregarJanelaImpressao(() => new BrowserWindow({
    show: false, autoHideMenuBar: true, webPreferences: { sandbox: false }
  }), tmpPath)
}

// Mesma ideia, mas com um PDF pronto — o caso do DANFE da nota fiscal, que vem
// montado do provedor fiscal (o layout do DANFE é definido em lei; gerar por
// conta seria reinventar com risco de sair errado). O Chromium abre PDF
// nativamente, então daqui pra frente o caminho de impressão é o mesmo do HTML.
async function carregarPdfOculto(base64: string, nomeBase: string): Promise<BrowserWindow> {
  const base = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_')
  const tmpPath = join(tmpdir(), `${base}-${Date.now()}.pdf`)
  writeFileSync(tmpPath, Buffer.from(base64, 'base64'))

  return carregarJanelaImpressao(() => new BrowserWindow({
    show: false, autoHideMenuBar: true, webPreferences: { sandbox: false, plugins: true }
  }), tmpPath, true)
}

/**
 * Os dois handlers que precisavam do `event` do IPC (listar impressoras e
 * imprimir a janela atual) agora recebem a janela principal por aqui — mesmo
 * padrão do `inicializarAtualizador`. O getter é necessário porque os handlers
 * se registram ANTES de a janela existir.
 *
 * Vale como decisão de produto, não só técnica: impressora é da máquina onde o
 * app está aberto. Quando o segundo caixa entrar em cena, é isso que garante
 * que ele imprima na impressora DELE, e não na do PC da loja.
 */
export function registrarHandlersImpressao(obterJanela: () => BrowserWindow | null): void {
  function janelaPrincipal(): BrowserWindow {
    const janela = obterJanela()
    if (!janela || janela.isDestroyed()) {
      throw new Error('A janela principal não está disponível.')
    }
    return janela
  }

  // Lista as impressoras instaladas — alimenta o diálogo de impressão no tema
  // do sistema (em vez da caixa nativa do Windows).
  registrarCanal('impressao:listarImpressoras', async (): Promise<RespostaIPC> => {
    try {
      const printers = await janelaPrincipal().webContents.getPrintersAsync()
      const lista = printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: p.isDefault
      }))
      return { success: true, data: lista }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Lê as preferências de impressora das duas categorias (cupom e documento).
  registrarCanal('impressao:obterPreferencias', async (): Promise<RespostaIPC> => {
    try {
      return {
        success: true,
        data: {
          cupom: lerPrefImpressora('cupom'),
          documento: lerPrefImpressora('documento'),
          papelCaixa: lerPapelCaixa()
        }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Salva preferências (parcial): grava só os campos presentes, pra não apagar o
  // que não veio (ex.: o diálogo lembra a impressora sem mexer no flag `direto`).
  registrarCanal(
    'impressao:salvarPreferencias',
    async (
      prefs: Partial<Record<CategoriaImpressao, { printer?: string; direto?: boolean }>> & {
        papelCaixa?: PapelCaixa
      }
    ): Promise<RespostaIPC> => {
      try {
        for (const cat of ['cupom', 'documento'] as CategoriaImpressao[]) {
          const p = prefs?.[cat]
          if (!p) continue
          if (typeof p.printer === 'string') gravarConfig(`impressora_${cat}`, p.printer)
          if (typeof p.direto === 'boolean') gravarConfig(`impressora_${cat}_direto`, p.direto ? '1' : '0')
        }
        // Só os dois valores conhecidos entram; qualquer outra coisa é ignorada
        // em silêncio, e a leitura cai no padrão.
        if (prefs?.papelCaixa === 'a4' || prefs?.papelCaixa === 'termica') {
          gravarConfig('papel_caixa', prefs.papelCaixa)
        }
        return { success: true, data: null }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  // Impressão física. Com `deviceName`, imprime SILENCIOSO na impressora escolhida
  // (sem a caixa nativa do Windows) — usado pelo diálogo de impressão do sistema.
  // Sem `deviceName`, mantém o diálogo nativo (retrocompatível, ex.: cupom).
  registrarCanal(
    'impressao:imprimir',
    async (html: string,
      nomeArquivo?: string,
      deviceName?: string
    ): Promise<RespostaIPC> => {
      let janela: BrowserWindow | null = null
      try {
        janela = await carregarHtmlOculto(html, nomeArquivo || 'documento')
        const alvo = janela
        await new Promise<void>((resolve, reject) => {
          const opcoes = deviceName
            ? { silent: true, deviceName, printBackground: false }
            : { silent: false, printBackground: false }
          alvo.webContents.print(opcoes, (sucesso, motivo) => {
            if (!alvo.isDestroyed()) alvo.destroy()
            // No modo silencioso, sucesso=false é falha real (ex.: impressora
            // offline). No modo nativo, sucesso=false é só o usuário cancelando.
            if (deviceName && !sucesso) reject(new Error(motivo || 'Falha na impressão'))
            else resolve()
          })
        })
        return { success: true, data: null }
      } catch (e) {
        return { success: false, error: String(e) }
      } finally {
        if (janela && !janela.isDestroyed()) janela.destroy()
      }
    }
  )

  /*
   * ⚠️ O tamanho da página na IMPRESSÃO de um PDF pronto, em MICRÔMETROS.
   *
   * Micrômetros, e não polegadas: `webContents.print()` usa uma unidade
   * diferente do `printToPDF()` logo abaixo, que usa polegadas. Trocar as
   * duas dá uma página microscópica ou gigante, sem erro nenhum.
   *
   * ── O defeito que isto conserta ────────────────────────────────
   * O DANFE da NFC-e saía na bobina deslocado para a direita, com meio
   * centímetro de papel escrito e o resto no vazio — o MESMO sintoma do
   * comprovante de entrega, e por um motivo parecido, mas não igual.
   *
   * Lá a causa era CSS nosso (`margin: 0 auto` sem `@media print`). Aqui não
   * há CSS nosso: o DANFE vem PRONTO do provedor fiscal, e o layout dele é
   * definido em lei. O que faltava era dizer ao Chromium em que papel
   * imprimir: sem `pageSize`, ele monta a página no padrão dele (carta/A4) e
   * encaixa a nota CENTRALIZADA numa folha de 210mm. Começando aos 65mm da
   * borda, e a bobina acabando aos 80, sobra exatamente aquela tira.
   *
   * ── ⚠️ E o pedaço que ainda faltava ────────────────────────────
   * Com a página de 80mm a nota voltou pro lugar, mas continuou cortada na
   * direita: sumiam a coluna de VL TOTAL, o valor a pagar, o troco e o último
   * dígito da chave. É que 80mm é a largura da BOBINA, não a que a cabeça
   * térmica escreve — ela alcança 72mm. A página tem que ser a largura
   * impressa, e o PDF tem que vir do provedor nessa mesma medida: página
   * maior que o PDF centraliza a nota e joga um pedaço pra fora de novo.
   *
   * Por isso a medida vem de `larguraDoDanfeMm()`, a mesma função que pede o
   * PDF à ACBr em `ipc/fiscal.ts`. É calculada a cada impressão porque a
   * bobina é configuração da loja e muda sem reiniciar o app.
   *
   * A altura de 297mm é folgada: nota mais longa que isso quebra em duas
   * páginas, o que na bobina é só continuar imprimindo.
   *
   * ⚠️ `documento` fica SEM tamanho de propósito. A NF-e (modelo 55) é A4 e
   * vai para a impressora de documentos; forçar papel ali tiraria do driver
   * uma escolha que é dele.
   */
  function papelDaImpressao(
    categoria: CategoriaImpressao
  ): { width: number; height: number } | null {
    if (categoria === 'documento') return null
    return { width: larguraDoDanfeMm() * 1000, height: 297_000 }
  }

  // Imprime um PDF já pronto (DANFE da nota fiscal). Mesmo comportamento do
  // handler de HTML: com deviceName imprime silencioso; sem, abre o diálogo.
  registrarCanal(
    'impressao:imprimirPdf',
    async (pdfBase64: string,
      nomeArquivo?: string,
      deviceName?: string,
      categoria: CategoriaImpressao = 'documento'
    ): Promise<RespostaIPC> => {
      let janela: BrowserWindow | null = null
      try {
        janela = await carregarPdfOculto(pdfBase64, nomeArquivo || 'documento')
        const alvo = janela
        await new Promise<void>((resolve, reject) => {
          const papel = papelDaImpressao(categoria)
          const opcoes = {
            ...(deviceName ? { silent: true, deviceName } : { silent: false }),
            printBackground: true,
            // Em bobina não existe margem: o que sobrar de branco é papel
            // gasto, e o conteúdo precisa começar encostado na esquerda.
            ...(papel
              ? { pageSize: papel, margins: { marginType: 'none' as const } }
              : {})
          }
          alvo.webContents.print(opcoes, (sucesso, motivo) => {
            if (!alvo.isDestroyed()) alvo.destroy()
            if (deviceName && !sucesso) reject(new Error(motivo || 'Falha na impressão'))
            else resolve()
          })
        })
        return { success: true, data: null }
      } catch (e) {
        return { success: false, error: String(e) }
      } finally {
        if (janela && !janela.isDestroyed()) janela.destroy()
      }
    }
  )

  // Impressão da JANELA ATUAL (o renderer que chamou), silenciosa, na impressora
  // escolhida. Usada pelas Etiquetas A4, que renderizam a folha calibrada na
  // própria tela (via @media print). A4 + margem 'none' pra casar o @page do CSS.
  registrarCanal(
    'impressao:imprimirJanela',
    async (deviceName: string): Promise<RespostaIPC> => {
      try {
        const alvo = janelaPrincipal()
        await new Promise<void>((resolve, reject) => {
          alvo.webContents.print(
            {
              silent: true,
              deviceName,
              printBackground: false,
              pageSize: 'A4',
              margins: { marginType: 'none' }
            },
            (sucesso, motivo) => {
              if (!sucesso) reject(new Error(motivo || 'Falha na impressão'))
              else resolve()
            }
          )
        })
        return { success: true, data: null }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  // Tamanho da página do PDF por categoria. Relatório e etiqueta são folha A4;
  // cupom e comprovante são bobina, e precisam de uma página do tamanho dela —
  // o CSS do cupom encosta o conteúdo à esquerda (é o que a térmica exige), e
  // numa folha A4 isso viraria uma tirinha no canto de uma página quase vazia.
  // Aqui a medida é em POLEGADAS (printToPDF), diferente do print(), que usa
  // micrômetros. 3.15in = 80mm de largura; 11.69in de altura pra um cupom
  // comum caber numa página só.
  const PAGINA_PDF = {
    documento: 'A4' as const,
    cupom: { width: 3.15, height: 11.69 }
  }

  // Salvar em PDF: gera o PDF internamente (printToPDF) e grava o arquivo já
  // com o nome definido. NÃO passa pelo "Microsoft Print to PDF" do Windows —
  // que ignora o nome do documento por esse caminho —, então o nome sempre
  // vem certo.
  registrarCanal(
    'impressao:salvarPdf',
    async (
      html: string,
      nomeArquivo?: string,
      categoria: CategoriaImpressao = 'documento'
    ): Promise<RespostaIPC> => {
      let janela: BrowserWindow | null = null
      try {
        const nome = nomeSeguro(nomeArquivo || 'documento')
        janela = await carregarHtmlOculto(html, nome)

        const pdf = await janela.webContents.printToPDF({
          pageSize: PAGINA_PDF[categoria] ?? PAGINA_PDF.documento,
          printBackground: false
        })
        janela.close()
        janela = null

        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Salvar PDF',
          defaultPath: `${nome}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (canceled || !filePath) {
          return { success: true, data: { canceled: true } }
        }

        writeFileSync(filePath, pdf)
        return { success: true, data: { canceled: false, filePath } }
      } catch (e) {
        if (janela && !janela.isDestroyed()) janela.destroy()
        return { success: false, error: String(e) }
      }
    }
  )
}
