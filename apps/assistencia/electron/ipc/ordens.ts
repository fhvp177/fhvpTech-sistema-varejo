import { ipcMain } from 'electron'
import {
  adicionarFotoOS,
  atualizarOS,
  criarOS,
  criarOSGarantia,
  definirItensOS,
  fecharOS,
  historicoDoAparelho,
  listarFotosOS,
  listarOS,
  mudarStatusOS,
  obterOS,
  removerFotoOS,
  type DadosEdicaoOS,
  type DadosFechamentoOS,
  type DadosItemOS,
  type DadosNovaOS,
  type ExtrasMudanca
} from '../db/queries/ordens'
import type { StatusOS } from '../db/queries/osCiclo'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerSessao } from '../sessao'

// OS é trabalho do dia a dia do técnico: toda operação exige sessão (o autor
// vai pra caixa-preta os_historico), mas nenhuma exige dono — dinheiro só
// entra no fechamento (Fase 3b-3), que passa pela máquina de vendas e
// carrega as travas dela.
export function registrarHandlersOrdens(): void {
  ipcMain.handle('os:listar', () => {
    try {
      requerSessao()
      return { success: true, data: listarOS() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:obter', (_event, id: number) => {
    try {
      requerSessao()
      const os = obterOS(id)
      if (!os) return { success: false, error: 'OS não encontrada.' }
      return { success: true, data: os }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:criar', (_event, dados: DadosNovaOS) => {
    try {
      const sessao = requerSessao()
      const os = criarOS(dados, sessao.id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: os }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:atualizar', (_event, id: number, dados: DadosEdicaoOS) => {
    try {
      requerSessao()
      atualizarOS(id, dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:definirItens', (_event, id: number, itens: DadosItemOS[]) => {
    try {
      const sessao = requerSessao()
      definirItensOS(id, Array.isArray(itens) ? itens : [], sessao.id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:mudarStatus', (_event, id: number, novo: StatusOS, extras?: ExtrasMudanca) => {
    try {
      const sessao = requerSessao()
      mudarStatusOS(id, novo, sessao.id, extras ?? {})
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:fechar', (_event, id: number, dados: DadosFechamentoOS) => {
    try {
      const sessao = requerSessao()
      const os = fecharOS(id, dados, sessao.id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: os }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:historicoAparelho', (_event, numeroSerie: string, ignorarOsId?: number) => {
    try {
      requerSessao()
      return { success: true, data: historicoDoAparelho(numeroSerie, ignorarOsId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Registro fotográfico do laudo. Adicionar/remover devolvem a lista nova —
  // o renderer não precisa de segunda viagem pra se atualizar.
  ipcMain.handle('os:listarFotos', (_event, osId: number) => {
    try {
      requerSessao()
      return { success: true, data: listarFotosOS(osId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:adicionarFoto', (_event, osId: number, nome: string | null, dados: string) => {
    try {
      requerSessao()
      const fotos = adicionarFotoOS(osId, nome, dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: fotos }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:removerFoto', (_event, fotoId: number) => {
    try {
      requerSessao()
      const fotos = removerFotoOS(fotoId)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: fotos }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('os:criarGarantia', (_event, osOrigemId: number, defeitoRelatado: string) => {
    try {
      const sessao = requerSessao()
      const os = criarOSGarantia(osOrigemId, defeitoRelatado, sessao.id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: os }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
