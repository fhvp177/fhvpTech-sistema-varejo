// Sessão do usuário logado (quem abriu o app). Vive em memória do main process —
// some quando o app fecha e exige novo login. Nunca persistir em disco: o PIN é a
// única garantia de "quem está aí" e cada abertura do app exige re-login.

import { obterAuthStore, type UsuarioAuth } from './store'

let sessaoUsuarioId: number | null = null

export function definirSessao(usuarioId: number): void {
  sessaoUsuarioId = usuarioId
}

export function limparSessao(): void {
  sessaoUsuarioId = null
}

export function obterSessaoId(): number | null {
  return sessaoUsuarioId
}

export function obterSessao(): UsuarioAuth | null {
  if (sessaoUsuarioId === null) return null
  const u = obterAuthStore().obterUsuario(sessaoUsuarioId)
  // Se o usuário logado foi removido/desativado por outro processo, a sessão
  // perde a validade. Limpa pra forçar novo login.
  if (!u || u.ativo === 0) {
    sessaoUsuarioId = null
    return null
  }
  return u
}

export function ehDono(): boolean {
  return obterSessao()?.papel === 'dono'
}

// Garante que a operação só prossegue se quem está logado é dono.
// Usado em handlers IPC sensíveis — chame antes da operação real.
export function requerDono(): void {
  const u = obterSessao()
  if (!u) throw new Error('Sessão não autenticada. Faça login novamente.')
  if (u.papel !== 'dono') {
    throw new Error('Esta ação requer permissão do dono.')
  }
}

// Retorna a sessão atual ou lança se não houver. Útil pra handlers que
// precisam atribuir algo ao usuário logado (auditoria futura).
export function requerSessao(): UsuarioAuth {
  const u = obterSessao()
  if (!u) throw new Error('Sessão não autenticada. Faça login novamente.')
  return u
}
