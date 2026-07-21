// Sessão do usuário logado (qual vendedor abriu o app).
// Vive em memória do main process — some quando o app fecha e exige novo login.
// Nunca persistir em disco: PIN é a única garantia de "quem está aí" e cada
// abertura do app exige re-login.
//
// ── Vocabulário: 'dono' no código, "Gerente" na tela ──────────────────────────
// O papel com acesso total se chama `'dono'` no banco e em todo o código
// (`ehDono`, `requerDono`, `pinDono`). Na INTERFACE ele aparece como
// "Gerente", que é o termo do dia a dia da loja — quem administra nem sempre é
// o proprietário. Renomear no banco exigiria migration e mexeria nos dados de
// todas as lojas, sem ganho nenhum para quem usa; então a tradução acontece só
// no texto. Se for mexer aqui, lembre: o valor gravado continua sendo 'dono'.

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

// Garante que a operação só prossegue se quem está logado é gerente.
// Usado em handlers IPC sensíveis — chame antes da operação real.
export function requerDono(): void {
  const v = obterSessao()
  if (!v) throw new Error('Sessão não autenticada. Faça login novamente.')
  if (v.papel !== 'dono') {
    throw new Error('Esta ação requer permissão do gerente da loja.')
  }
}

// Retorna a sessão atual ou lança se não houver. Útil pra handlers que
// precisam atribuir algo ao vendedor logado (vendas, auditoria futura).
export function requerSessao(): Vendedor {
  const v = obterSessao()
  if (!v) throw new Error('Sessão não autenticada. Faça login novamente.')
  return v
}
