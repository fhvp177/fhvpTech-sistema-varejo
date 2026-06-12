// Sessão do usuário logado (qual vendedor abriu o app).
// Vive em memória do main process — some quando o app fecha e exige novo login.
// Nunca persistir em disco: PIN é a única garantia de "quem está aí" e cada
// abertura do app exige re-login.

import { obterVendedor, type Vendedor } from './db/queries/vendedores'

let sessaoVendedorId: number | null = null

export function definirSessao(vendedorId: number): void {
  sessaoVendedorId = vendedorId
}

export function limparSessao(): void {
  sessaoVendedorId = null
}

export function obterSessaoId(): number | null {
  return sessaoVendedorId
}

export function obterSessao(): Vendedor | null {
  if (sessaoVendedorId === null) return null
  const v = obterVendedor(sessaoVendedorId)
  // Se o vendedor logado foi removido/desativado por outro processo, a sessão
  // perde a validade. Limpa pra forçar novo login.
  if (!v || v.ativo === 0) {
    sessaoVendedorId = null
    return null
  }
  return v
}

export function ehDono(): boolean {
  return obterSessao()?.papel === 'dono'
}

// Garante que a operação só prossegue se quem está logado é dono.
// Usado em handlers IPC sensíveis — chame antes da operação real.
export function requerDono(): void {
  const v = obterSessao()
  if (!v) throw new Error('Sessão não autenticada. Faça login novamente.')
  if (v.papel !== 'dono') {
    throw new Error('Esta ação requer permissão do dono da loja.')
  }
}

// Retorna a sessão atual ou lança se não houver. Útil pra handlers que
// precisam atribuir algo ao vendedor logado (vendas, auditoria futura).
export function requerSessao(): Vendedor {
  const v = obterSessao()
  if (!v) throw new Error('Sessão não autenticada. Faça login novamente.')
  return v
}
