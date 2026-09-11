import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const d = vi.hoisted(() => ({ quit: vi.fn(), janelas: [] as unknown[], carregar: vi.fn(), config: vi.fn(), backup: vi.fn(), dialogo: vi.fn() }))
vi.mock('electron', () => ({
  app: { quit: d.quit },
  dialog: { showMessageBox: d.dialogo },
  BrowserWindow: class extends EventEmitter {
    destruida = false
    loadFile = d.carregar
    constructor() { super(); d.janelas.push(this) }
    isDestroyed() { return this.destruida }
    destroy() { this.destruida = true; this.emit('closed') }
  }
}))
vi.mock('@fhvptech/core/electron/backup/BackupManager', () => ({ obterBackupManager: () => ({ executarBackup: d.backup }) }))
vi.mock('@fhvptech/core/electron/backup/configBackup', () => ({ lerConfig: d.config, gravarConfig: vi.fn() }))
const { BrowserWindow: JanelaTeste } = await import('electron')
const criarJanela = () => new JanelaTeste()
const { registrarEncerramentoJanela } = await import('@fhvptech/core/electron/encerramentoJanela')
const { carregarJanelaImpressao, TEMPO_CARREGAR_IMPRESSAO_MS } = await import('@fhvptech/core/electron/impressao/janelaOculta')
const { registrarBackupAoFechar } = await import('@fhvptech/core/electron/backup/BackupAoFechar')

beforeEach(() => { vi.clearAllMocks(); d.janelas.length = 0 })
afterEach(() => vi.useRealTimers())

describe('fechamento não deixa o aplicativo sem janela segurando a trava', () => {
  it('solicita sair quando a principal fecha, sem depender das invisíveis', () => {
    const principal = new EventEmitter()
    registrarEncerramentoJanela(principal, d.quit)
    expect(d.quit).not.toHaveBeenCalled()
    principal.emit('closed')
    expect(d.quit).toHaveBeenCalledTimes(process.platform === 'darwin' ? 0 : 1)
  })
  it('destrói a janela invisível quando loadFile falha, antes de poder devolvê-la ao chamador', async () => {
    d.carregar.mockRejectedValueOnce(new Error('documento inválido'))
    await expect(carregarJanelaImpressao(criarJanela, 'arquivo-ficticio.pdf', true)).rejects.toThrow('documento inválido')
    expect((d.janelas[0] as BrowserWindow).isDestroyed()).toBe(true)
  })
  it('carregamento que nunca termina não deixa uma janela invisível eterna', async () => {
    vi.useFakeTimers()
    d.carregar.mockImplementationOnce(() => new Promise(() => {}))
    const resultado = expect(carregarJanelaImpressao(criarJanela, 'arquivo-ficticio.html')).rejects.toThrow('demorou')
    await vi.advanceTimersByTimeAsync(TEMPO_CARREGAR_IMPRESSAO_MS)
    await resultado
    expect((d.janelas[0] as BrowserWindow).isDestroyed()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('não destrói documento carregado antes de imprimir', async () => {
    d.carregar.mockResolvedValueOnce(undefined)
    const janela = await carregarJanelaImpressao(criarJanela, 'arquivo-ficticio.html')
    expect(janela.isDestroyed()).toBe(false)
  })
  it('dois cliques no X aguardam um único backup e só depois encerram', async () => {
    let concluir!: (r: { sucesso: boolean }) => void
    d.config.mockImplementation((chave: string) => chave === 'backup_ao_fechar' ? 'sempre' : '')
    d.backup.mockImplementationOnce(() => new Promise(resolve => { concluir = resolve }))
    const janela = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      destroy: vi.fn(),
      webContents: { send: vi.fn() }
    })
    registrarBackupAoFechar(janela as unknown as BrowserWindow)
    const evento = { preventDefault: vi.fn() }
    janela.emit('close', evento)
    janela.emit('close', evento)
    expect(d.backup).toHaveBeenCalledTimes(1)
    expect(janela.destroy).not.toHaveBeenCalled()
    concluir({ sucesso: true })
    await vi.waitFor(() => expect(janela.destroy).toHaveBeenCalledTimes(1))
  })
  it('cancelar após falha do backup permite tentar fechar de novo', async () => {
    d.config.mockImplementation((chave: string) => chave === 'backup_ao_fechar' ? 'sempre' : '')
    d.backup.mockResolvedValue({ sucesso: false, erro: 'Disco indisponível.' })
    d.dialogo.mockResolvedValue({ response: 1 })
    const janela = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, destroy: vi.fn(), webContents: { send: vi.fn() }
    })
    registrarBackupAoFechar(janela as unknown as BrowserWindow)
    const fechar = janela.listeners('close')[0]
    await fechar({ preventDefault: vi.fn() })
    await fechar({ preventDefault: vi.fn() })
    expect(d.backup).toHaveBeenCalledTimes(2)
    expect(janela.destroy).not.toHaveBeenCalled()
  })
})
