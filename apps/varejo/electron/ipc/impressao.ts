import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'

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

// Tira do nome o que o Windows não aceita em nome de arquivo.
function nomeSeguro(nome: string): string {
  return nome.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'documento'
}

// Carrega o HTML num BrowserWindow oculto e devolve a janela pronta pra imprimir.
async function carregarHtmlOculto(html: string, nomeBase: string): Promise<BrowserWindow> {
  const base = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_')
  const tmpPath = join(tmpdir(), `${base}-${Date.now()}.html`)
  writeFileSync(tmpPath, html, 'utf-8')

  const janela = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: { sandbox: false }
  })
  await janela.loadFile(tmpPath)
  return janela
}

// Mesma ideia, mas com um PDF pronto — o caso do DANFE da nota fiscal, que vem
// montado do provedor fiscal (o layout do DANFE é definido em lei; gerar por
// conta seria reinventar com risco de sair errado). O Chromium abre PDF
// nativamente, então daqui pra frente o caminho de impressão é o mesmo do HTML.
async function carregarPdfOculto(base64: string, nomeBase: string): Promise<BrowserWindow> {
  const base = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_')
  const tmpPath = join(tmpdir(), `${base}-${Date.now()}.pdf`)
  writeFileSync(tmpPath, Buffer.from(base64, 'base64'))

  const janela = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: { sandbox: false, plugins: true } // plugins: viewer de PDF
  })
  await janela.loadFile(tmpPath)
  // O viewer precisa de um instante pra renderizar antes de imprimir; sem isso
  // sai página em branco em máquina lenta.
  await new Promise((r) => setTimeout(r, 400))
  return janela
}

export function registrarHandlersImpressao(): void {
  // Lista as impressoras instaladas — alimenta o diálogo de impressão no tema
  // do sistema (em vez da caixa nativa do Windows).
  ipcMain.handle('impressao:listarImpressoras', async (event): Promise<RespostaIPC> => {
    try {
      const printers = await event.sender.getPrintersAsync()
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
  ipcMain.handle('impressao:obterPreferencias', async (): Promise<RespostaIPC> => {
    try {
      return {
        success: true,
        data: { cupom: lerPrefImpressora('cupom'), documento: lerPrefImpressora('documento') }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // Salva preferências (parcial): grava só os campos presentes, pra não apagar o
  // que não veio (ex.: o diálogo lembra a impressora sem mexer no flag `direto`).
  ipcMain.handle(
    'impressao:salvarPreferencias',
    async (
      _event,
      prefs: Partial<Record<CategoriaImpressao, { printer?: string; direto?: boolean }>>
    ): Promise<RespostaIPC> => {
      try {
        for (const cat of ['cupom', 'documento'] as CategoriaImpressao[]) {
          const p = prefs?.[cat]
          if (!p) continue
          if (typeof p.printer === 'string') gravarConfig(`impressora_${cat}`, p.printer)
          if (typeof p.direto === 'boolean') gravarConfig(`impressora_${cat}_direto`, p.direto ? '1' : '0')
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
  ipcMain.handle(
    'impressao:imprimir',
    async (
      _event,
      html: string,
      nomeArquivo?: string,
      deviceName?: string
    ): Promise<RespostaIPC> => {
      try {
        const janela = await carregarHtmlOculto(html, nomeArquivo || 'documento')
        await new Promise<void>((resolve, reject) => {
          const opcoes = deviceName
            ? { silent: true, deviceName, printBackground: false }
            : { silent: false, printBackground: false }
          janela.webContents.print(opcoes, (sucesso, motivo) => {
            janela.close()
            // No modo silencioso, sucesso=false é falha real (ex.: impressora
            // offline). No modo nativo, sucesso=false é só o usuário cancelando.
            if (deviceName && !sucesso) reject(new Error(motivo || 'Falha na impressão'))
            else resolve()
          })
        })
        return { success: true, data: null }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  // Imprime um PDF já pronto (DANFE da nota fiscal). Mesmo comportamento do
  // handler de HTML: com deviceName imprime silencioso; sem, abre o diálogo.
  ipcMain.handle(
    'impressao:imprimirPdf',
    async (
      _event,
      pdfBase64: string,
      nomeArquivo?: string,
      deviceName?: string
    ): Promise<RespostaIPC> => {
      let janela: BrowserWindow | null = null
      try {
        janela = await carregarPdfOculto(pdfBase64, nomeArquivo || 'documento')
        const alvo = janela
        await new Promise<void>((resolve, reject) => {
          const opcoes = deviceName
            ? { silent: true, deviceName, printBackground: true }
            : { silent: false, printBackground: true }
          alvo.webContents.print(opcoes, (sucesso, motivo) => {
            alvo.close()
            if (deviceName && !sucesso) reject(new Error(motivo || 'Falha na impressão'))
            else resolve()
          })
        })
        return { success: true, data: null }
      } catch (e) {
        if (janela && !janela.isDestroyed()) janela.close()
        return { success: false, error: String(e) }
      }
    }
  )

  // Impressão da JANELA ATUAL (o renderer que chamou), silenciosa, na impressora
  // escolhida. Usada pelas Etiquetas A4, que renderizam a folha calibrada na
  // própria tela (via @media print). A4 + margem 'none' pra casar o @page do CSS.
  ipcMain.handle(
    'impressao:imprimirJanela',
    async (event, deviceName: string): Promise<RespostaIPC> => {
      try {
        await new Promise<void>((resolve, reject) => {
          event.sender.print(
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

  // Salvar em PDF: gera o PDF internamente (printToPDF) e grava o arquivo já
  // com o nome definido. NÃO passa pelo "Microsoft Print to PDF" do Windows —
  // que ignora o nome do documento por esse caminho —, então o nome sempre
  // vem certo.
  ipcMain.handle(
    'impressao:salvarPdf',
    async (_event, html: string, nomeArquivo?: string): Promise<RespostaIPC> => {
      let janela: BrowserWindow | null = null
      try {
        const nome = nomeSeguro(nomeArquivo || 'documento')
        janela = await carregarHtmlOculto(html, nome)

        const pdf = await janela.webContents.printToPDF({
          pageSize: 'A4',
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
        if (janela) janela.close()
        return { success: false, error: String(e) }
      }
    }
  )
}
