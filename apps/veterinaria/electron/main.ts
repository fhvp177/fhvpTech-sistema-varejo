import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { inicializarBancoDeDados, obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { executarMigrations } from '@fhvptech/core/electron/db/migrations'
import { criarTabelas } from './db/schema'
import { MIGRATIONS } from './db/migrations'
import { registrarHandlersLicenca } from '@fhvptech/core/electron/ipc/licenca'
import { registrarHandlersLicencaPagamento } from '@fhvptech/core/electron/ipc/licenca-pagamento'
import { configurarAuthStore } from '@fhvptech/core/electron/auth/store'
import { registrarHandlersAuth } from '@fhvptech/core/electron/ipc/auth'
import { registrarHandlersUsuarios } from './ipc/usuarios'
import { registrarHandlersTutores } from './ipc/tutores'
import { registrarHandlersServicos } from './ipc/servicos'
import { registrarHandlersProdutos } from './ipc/produtos'
import {
  obterUsuario,
  listarParaLogin,
  obterPinHash,
  gravarPinHash,
  contarDonosAtivos
} from './db/queries/usuarios'
import {
  obterUsuarioAtivoPorEmail,
  salvarCodigoRecuperacao,
  obterCodigoRecuperacao,
  incrementarTentativasCodigo,
  apagarCodigosRecuperacao
} from './db/queries/recuperacao'

// O menu padrão do Electron registra o "aumentar zoom" como "Ctrl +", que não
// dispara em teclado ABNT2 (onde o "+" só existe com Shift). Resultado: dava pra
// diminuir a tela com Ctrl+- e não dava pra voltar. Aqui as teclas são tratadas
// na mão, aceitando todas as variações do teclado brasileiro. O preventDefault
// também neutraliza o atalho do menu, então não aplica o zoom duas vezes.
const ZOOM_MINIMO = -3
const ZOOM_MAXIMO = 3
const PASSO_ZOOM = 0.5

function registrarZoomPorTeclado(janela: BrowserWindow): void {
  janela.webContents.on('before-input-event', (evento, entrada) => {
    if (entrada.type !== 'keyDown') return
    if (!entrada.control || entrada.alt) return

    const conteudo = janela.webContents
    const { key, code } = entrada

    if (key === '+' || key === '=' || code === 'NumpadAdd') {
      conteudo.setZoomLevel(Math.min(ZOOM_MAXIMO, conteudo.getZoomLevel() + PASSO_ZOOM))
    } else if (key === '-' || key === '_' || code === 'NumpadSubtract') {
      conteudo.setZoomLevel(Math.max(ZOOM_MINIMO, conteudo.getZoomLevel() - PASSO_ZOOM))
    } else if (key === '0' || code === 'Numpad0') {
      conteudo.setZoomLevel(0)
    } else {
      return
    }

    evento.preventDefault()
  })
}

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

  registrarZoomPorTeclado(janela)

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

  // Injeta a "loja de usuários" da vet no motor de auth do core ANTES de
  // registrar os handlers (que dependem dela). Tabela `usuarios` + recuperação.
  configurarAuthStore({
    obterUsuario,
    listarParaLogin,
    obterPinHash,
    gravarPinHash,
    contarDonosAtivos,
    obterUsuarioAtivoPorEmail,
    salvarCodigoRecuperacao,
    obterCodigoRecuperacao,
    incrementarTentativasCodigo,
    apagarCodigosRecuperacao
  })

  registrarHandlersLicenca()
  registrarHandlersLicencaPagamento()
  registrarHandlersAuth()
  registrarHandlersUsuarios()
  registrarHandlersTutores()
  registrarHandlersServicos()
  registrarHandlersProdutos()

  criarJanela()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
