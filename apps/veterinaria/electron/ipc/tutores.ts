import { ipcMain } from 'electron'
import {
  listarTutores,
  criarTutor,
  atualizarTutor,
  deletarTutor,
  listarPets,
  criarPet,
  atualizarPet,
  deletarPet
} from '../db/queries/tutores'

// Cadastro de tutores e pets. Operações de dia a dia — abertas a qualquer
// usuário logado (a tela já está atrás do login).
export function registrarHandlersTutores(): void {
  ipcMain.handle('tutores:listar', () => {
    try {
      return { success: true, data: listarTutores() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'tutores:criar',
    (_event, dados: { nome: string; telefone?: string | null; email?: string | null }) => {
      try {
        return { success: true, data: criarTutor(dados) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'tutores:atualizar',
    (
      _event,
      id: number,
      dados: { nome?: string; telefone?: string | null; email?: string | null }
    ) => {
      try {
        atualizarTutor(id, dados)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('tutores:deletar', (_event, id: number) => {
    try {
      deletarTutor(id)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ─── Pets (sempre no contexto de um tutor) ───────────────────────────
  ipcMain.handle('pets:listar', (_event, tutorId: number) => {
    try {
      return { success: true, data: listarPets(tutorId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'pets:criar',
    (
      _event,
      tutorId: number,
      dados: { nome: string; especie?: string | null; raca?: string | null; nascimento?: string | null }
    ) => {
      try {
        return { success: true, data: criarPet(tutorId, dados) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'pets:atualizar',
    (
      _event,
      id: number,
      dados: { nome?: string; especie?: string | null; raca?: string | null; nascimento?: string | null }
    ) => {
      try {
        atualizarPet(id, dados)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('pets:deletar', (_event, id: number) => {
    try {
      deletarPet(id)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
