import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { montarPonteIpc } from '@fhvptech/core/electron/roteador'
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
import { registrarHandlersLicenca } from '@fhvptech/core/electron/ipc/licenca'
import { registrarHandlersLicencaPagamento } from '@fhvptech/core/electron/ipc/licenca-pagamento'
import { registrarHandlersFornecedores } from './ipc/fornecedores'
import { registrarHandlersContasPagar } from './ipc/contasPagar'
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
import { registrarHandlersLoja } from './ipc/loja'
import { registrarHandlersFiscal } from './ipc/fiscal'
import { registrarHandlersPreferenciasUi } from './ipc/preferenciasUi'
import { registrarHandlersOnboarding } from './ipc/onboarding'
import { registrarHandlersNotificacoes } from './ipc/notificacoes'
import { registrarHandlersNovidades } from './ipc/novidades'
import { registrarHandlersNotasEntrada } from './ipc/notasEntrada'
import { registrarHandlersMulticaixa } from './ipc/multicaixa'
import { retomarServidorSeConfigurado } from './multicaixa/servico'
import { ligarModoTerminal } from './multicaixa/terminal'
import { inicializarAtualizador } from './atualizador'
import { corrigirCaminhosBackupLegados, resolverPastaDados } from './pastaDados'

// A pasta de dados (banco + licença + heartbeat) segue, por padrão, o
// productName do Electron — que mudou ao longo das versões e por isso JÁ órfãou
// o banco de máquinas que atualizaram de versões antigas. `resolverPastaDados`
// olha as pastas que o app já usou, acha a que tem dados de verdade e aponta o
// userData pra ela — renomeando a pasta legada ("Sistema RT") pro nome oficial
// ("FHVP Tech Varejo") quando dá, com fallback pra legada se o Windows recusar.
// Tem que rodar antes de qualquer uso de userData (banco, licença, backup).
// Ver electron/pastaDados.ts.
app.setPath('userData', resolverPastaDados())

let janelaAtual: BrowserWindow | null = null

// Trava de instância única. Sem ela dava pra abrir o sistema DUAS vezes, e a
// cópia extra (a) segura os arquivos do app durante o update — o instalador
// falha com "Falha ao desinstalar os arquivos do aplicativo antigo" até a
// máquina reiniciar — e (b) escreve no mesmo banco da primeira. Quem perde a
// trava só acorda a cópia original (via 'second-instance' nela) e se encerra.
const instanciaUnica = app.requestSingleInstanceLock()
if (!instanciaUnica) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (janelaAtual && !janelaAtual.isDestroyed()) {
      if (janelaAtual.isMinimized()) janelaAtual.restore()
      janelaAtual.show()
      janelaAtual.focus()
    }
  })
}

// O menu padrão do Electron registra o "aumentar zoom" como "Ctrl +", que não
// dispara em teclado ABNT2 (onde o "+" só existe com Shift). Resultado: o
// lojista conseguia diminuir a tela com Ctrl+- e não conseguia voltar. Aqui as
// teclas são tratadas na mão, aceitando todas as variações do teclado
// brasileiro. O preventDefault também neutraliza o atalho do menu, então não
// existe risco de aplicar o zoom duas vezes.
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

  registrarZoomPorTeclado(janelaAtual)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    janelaAtual.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    janelaAtual.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Cópia que perdeu a trava de instância única: não toca no banco nem cria
  // janela — o quit() acima já está a caminho.
  if (!instanciaUnica) return

  // ── Segundo caixa: esta máquina não tem banco ──────────────────────────────
  // Quando o app está configurado como terminal, ele NÃO abre banco, não roda
  // migration e não faz backup. Essa ausência é a garantia central do desenho:
  // sem um segundo conjunto de dados, não existe divergência possível entre as
  // duas máquinas. O pior caso vira "sem conexão".
  //
  // A decisão precisa vir antes de tudo, porque abrir o banco criaria o arquivo
  // vazio no terminal — e um banco vazio ao lado do banco de verdade é
  // exatamente o tipo de confusão que custa caro depois.
  // O aviso de conexão vai por evento, e não por consulta repetida: a tela
  // precisa saber no instante em que cai, não meio segundo depois. A janela é
  // buscada na hora porque neste ponto ela ainda não existe.
  const ehTerminal = ligarModoTerminal((conectado) => {
    janelaAtual?.webContents.send('multicaixa:conexao', conectado)
  })

  configurarNucleo({ criarTabelas, migrations: MIGRATIONS, validarLicenca })
  if (!ehTerminal) {
    inicializarBancoDeDados(criarTabelas)
    executarMigrations(obterBancoDeDados(), MIGRATIONS)
    // Depois do rename da pasta de dados (ou de um restore de outra máquina), a
    // config pode apontar pra pasta de backups que não existe mais — conserta
    // antes do BackupManager/Restaurador lerem.
    corrigirCaminhosBackupLegados()
    inicializarBackupManager()
    inicializarBackupAutomatico()
  }

  // Registra todos os handlers IPC antes de criar a janela
  registrarHandlersLicenca()
  registrarHandlersLicencaPagamento()
  registrarHandlersFornecedores()
  registrarHandlersContasPagar()
  registrarHandlersCategorias()
  registrarHandlersClientes()
  registrarHandlersProdutos()
  registrarHandlersVendas()
  registrarHandlersVendedores()
  registrarHandlersEtiquetas()
  registrarHandlersBackup()
  registrarHandlersImpressao(() => janelaAtual)
  registrarHandlersDashboard()
  registrarHandlersAuth()
  registrarHandlersChat()
  registrarHandlersDevolucoes()
  registrarHandlersLoja()
  registrarHandlersFiscal()
  registrarHandlersPreferenciasUi()
  registrarHandlersOnboarding()
  registrarHandlersNotificacoes()
  registrarHandlersNovidades()
  registrarHandlersNotasEntrada()
  registrarHandlersMulticaixa()

  // Liga os canais registrados acima ao ipcMain. Os handlers agora vivem num
  // Map no core (`registrarCanal`) em vez de irem direto no `ipcMain.handle` —
  // é o que vai permitir, mais adiante, atender a mesma chamada vinda do
  // segundo caixa pela rede sem duplicar lógica nenhuma.
  //
  // Os 3 canais do atualizador se registram depois daqui, porque dependem da
  // janela; o roteador liga cada retardatário na hora.
  //
  // Os canais de licença do core seguem no `ipcMain` direto: a veterinária e a
  // assistência usam os mesmos handlers e ainda não têm roteador.
  montarPonteIpc(ipcMain)

  criarJanelaPrincipal()

  // Inicializa o autoUpdater + IPC + backup pré-atualização.
  // Precisa rodar depois de criarJanelaPrincipal pra ter a janela como alvo dos eventos.
  inicializarAtualizador(() => janelaAtual)

  // Se o lojista deixou o modo servidor ligado, volta a atender o segundo caixa.
  // Depois da janela porque falhar aqui (porta ocupada) não pode atrasar nem
  // impedir a abertura do caixa principal. No terminal não há o que retomar.
  if (!ehTerminal) void retomarServidorSeConfigurado()

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
