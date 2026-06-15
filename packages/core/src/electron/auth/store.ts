// Porta (adapter) que o motor de auth do núcleo precisa mas não conhece. Cada
// app (nicho) registra a sua uma única vez no boot, via configurarAuthStore(),
// ANTES de registrar os handlers de auth. Mantém o núcleo agnóstico ao domínio:
// o motor (bcrypt, sessão, auto-lock, recuperação) vive no core; QUEM são os
// usuários e ONDE moram (tabela `usuarios` na vet, `vendedores` no varejo) é de
// cada nicho e entra por aqui. Mesmo padrão do configurarNucleo() em nucleo.ts.

export type PapelUsuario = 'dono' | 'funcionario'

// Visão pública de um usuário — pin_hash NUNCA aparece aqui (fica só no main,
// acessível pelo motor via obterPinHash). Sem contagens de domínio (ex.: vendas).
export type UsuarioAuth = {
  id: number
  nome: string
  ativo: number
  papel: PapelUsuario
  email: string | null
  tem_pin: number
}

// Versão mínima da tela de login — sem dados sensíveis nem contagens.
export type UsuarioParaLogin = {
  id: number
  nome: string
  papel: PapelUsuario
  tem_pin: number
}

// Usado no fluxo de recuperação por email.
export type UsuarioEmail = { id: number; nome: string; email: string }

export type CodigoRecuperacao = {
  id: number
  codigo_hash: string
  expira_em: string
  tentativas: number
}

// O contrato que cada app implementa sobre a sua tabela de usuários. Tudo roda
// no main process — better-sqlite3 é síncrono, então os métodos são síncronos.
export interface AuthStore {
  obterUsuario(id: number): UsuarioAuth | null
  listarParaLogin(): UsuarioParaLogin[]
  // Uso interno do motor — o hash nunca trafega pelo IPC.
  obterPinHash(id: number): string | null
  gravarPinHash(id: number, pinHash: string): void
  contarDonosAtivos(): number
  obterUsuarioAtivoPorEmail(email: string): UsuarioEmail | null
  salvarCodigoRecuperacao(usuarioId: number, codigoHash: string, expiraEm: string): void
  obterCodigoRecuperacao(usuarioId: number): CodigoRecuperacao | null
  incrementarTentativasCodigo(codigoId: number): void
  apagarCodigosRecuperacao(usuarioId: number): void
}

let store: AuthStore | null = null

export function configurarAuthStore(s: AuthStore): void {
  store = s
}

export function obterAuthStore(): AuthStore {
  if (!store) {
    throw new Error(
      'Auth não configurado: chame configurarAuthStore() no boot antes de registrar os handlers de auth.'
    )
  }
  return store
}
