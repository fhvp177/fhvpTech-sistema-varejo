import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { inicializarBancoDeDados, obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { executarMigrations } from '@fhvptech/core/electron/db/migrations'
import { criarTabelas } from './db/schema'
import { MIGRATIONS } from './db/migrations'
import { registrarHandlersLicenca } from '@fhvptech/core/electron/ipc/licenca'
import { registrarHandlersLicencaPagamento } from '@fhvptech/core/electron/ipc/licenca-pagamento'

function criarJanela(): void {
  const janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  janela.on('ready-to-show', () => {
    janela.maximize()
    janela.show()
  })

  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    janela.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    janela.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Reaproveita banco, migrations e licença do @fhvptech/core (compartilhados
  // com o varejo). Backup entra quando suas tabelas virarem migration do core.
  inicializarBancoDeDados(criarTabelas)
  executarMigrations(obterBancoDeDados(), MIGRATIONS)
  registrarHandlersLicenca()
  registrarHandlersLicencaPagamento()

  criarJanela()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
