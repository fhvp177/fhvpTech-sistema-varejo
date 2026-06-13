import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { inicializarBancoDeDados, obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { criarTabelas } from './db/schema'
import { executarMigrations } from '@fhvptech/core/electron/db/migrations'
import { MIGRATIONS } from './backup/migrations'
import { configurarNucleo } from '@fhvptech/core/electron/nucleo'
import { validarLicenca } from '@fhvptech/core/electron/licenca'
import { inicializarBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { inicializarBackupAutomatico } from '@fhvptech/core/electron/backup/BackupAutomatico'
import { registrarBackupAoFechar } from '@fhvptech/core/electron/backup/BackupAoFechar'
import { registrarHandlersLicenca } from './ipc/licenca'
import { registrarHandlersLicencaPagamento } from './ipc/licenca-pagamento'
import { registrarHandlersFornecedores } from './ipc/fornecedores'
import { registrarHandlersCategorias } from './ipc/categorias'
import { registrarHandlersClientes } from './ipc/clientes'
import { registrarHandlersProdutos } from './ipc/produtos'
import { registrarHandlersVendas } from './ipc/vendas'
import { registrarHandlersVendedores } from './ipc/vendedores'
import { registrarHandlersEtiquetas } from './ipc/etiquetas'
import { registrarHandlersBackup } from './ipc/backup'
import { registrarHandlersImpressao } from './ipc/impressao'
import { registrarHandlersDashboard } from './ipc/dashboard'
import { registrarHandlersAuth } from './ipc/auth'
import { registrarHandlersChat } from './ipc/chat'
import { registrarHandlersDevolucoes } from './ipc/devolucoes'
import { inicializarAtualizador } from './atualizador'

let janelaAtual: BrowserWindow | null = null

function criarJanelaPrincipal(): void {
  janelaAtual = new BrowserWindow({
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

  janelaAtual.on('ready-to-show', () => {
    janelaAtual?.maximize()
    janelaAtual?.show()
  })

  registrarBackupAoFechar(janelaAtual)

  // Abre links externos no navegador padrão, não dentro do app
  janelaAtual.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    janelaAtual.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    janelaAtual.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Injeta os ganchos de domínio no núcleo (schema, migrations, licença) antes
  // de inicializar banco e backup, que dependem deles.
  configurarNucleo({ criarTabelas, migrations: MIGRATIONS, validarLicenca })
  inicializarBancoDeDados(criarTabelas)
  executarMigrations(obterBancoDeDados(), MIGRATIONS)
  inicializarBackupManager()
  inicializarBackupAutomatico()

  // Registra todos os handlers IPC antes de criar a janela
  registrarHandlersLicenca()
  registrarHandlersLicencaPagamento()
  registrarHandlersFornecedores()
  registrarHandlersCategorias()
  registrarHandlersClientes()
  registrarHandlersProdutos()
  registrarHandlersVendas()
  registrarHandlersVendedores()
  registrarHandlersEtiquetas()
  registrarHandlersBackup()
  registrarHandlersImpressao()
  registrarHandlersDashboard()
  registrarHandlersAuth()
  registrarHandlersChat()
  registrarHandlersDevolucoes()

  criarJanelaPrincipal()

  // Inicializa o autoUpdater + IPC + backup pré-atualização.
  // Precisa rodar depois de criarJanelaPrincipal pra ter a janela como alvo dos eventos.
  inicializarAtualizador(() => janelaAtual)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      criarJanelaPrincipal()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
