import { ipcMain } from 'electron'
import {
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  alterarPapel,
  alternarAtivoUsuario,
  deletarUsuario
} from '../db/queries/usuarios'
import { redefinirPin } from '@fhvptech/core/electron/auth/auth'
import { requerDono } from '@fhvptech/core/electron/auth/sessao'
import type { PapelUsuario } from '@fhvptech/core/electron/auth/store'

// Gestão de usuários da clínica (área do dono). O cadastro/login em si usa o
// motor de auth do core; aqui é o CRUD administrativo. Mutações exigem dono.
export function registrarHandlersUsuarios(): void {
  // Leitura — a UI já restringe a tela ao dono.
  ipcMain.handle('usuarios:listar', () => {
    try {
      return { success: true, data: listarUsuarios() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('usuarios:criar', (_event, dados: { nome: string; email?: string | null }) => {
    try {
      requerDono()
      const resultado = criarUsuario(dados.nome, { email: dados.email ?? null })
      return { success: true, data: resultado }
    } catch (error) {
      const msg = (error as Error).message
      if (msg.includes('UNIQUE')) {
        return { success: false, error: 'Já existe um usuário com esse nome.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle(
    'usuarios:atualizar',
    (_event, id: number, dados: { nome?: string; email?: string | null }) => {
      try {
        requerDono()
        atualizarUsuario(id, dados)
        return { success: true, data: null }
      } catch (error) {
        const msg = (error as Error).message
        if (msg.includes('UNIQUE')) {
          return { success: false, error: 'Já existe um usuário com esse nome.' }
        }
        return { success: false, error: msg }
      }
    }
  )

  ipcMain.handle('usuarios:alternarAtivo', (_event, id: number, ativo: boolean) => {
    try {
      requerDono()
      alternarAtivoUsuario(id, ativo)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('usuarios:alterarPapel', (_event, id: number, papel: PapelUsuario) => {
    try {
      requerDono()
      alterarPapel(id, papel)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('usuarios:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarUsuario(id)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Dono redefine o PIN de um usuário (ex.: esqueceu). O motor do core valida o
  // formato e grava o hash; o usuário pode trocar pelo próprio depois.
  ipcMain.handle('usuarios:redefinirPin', async (_event, id: number, novoPin: string) => {
    try {
      requerDono()
      await redefinirPin(id, novoPin)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
