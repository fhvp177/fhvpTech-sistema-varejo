import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { obterAuthStore } from './store'

// Motor de auth do núcleo — agnóstico de domínio. Opera sobre a "loja de
// usuários" injetada (ver store.ts): bcrypt para PIN, recuperação por email e
// auto-lock. Regras de negócio de cada nicho (ex.: teto de desconto do varejo)
// NÃO vivem aqui.

const CHAVE_AUTO_LOCK = 'auto_lock_minutos'
const BCRYPT_ROUNDS = 12

// Recuperação de PIN por email.
const MINUTOS_VALIDADE_RECUPERACAO = 15
const MAX_TENTATIVAS_RECUPERACAO = 3

// Aceita PIN de 4 a 6 dígitos numéricos.
const REGEX_PIN = /^\d{4,6}$/

function validarFormatoPin(pin: string): void {
  if (!REGEX_PIN.test(pin)) {
    throw new Error('O PIN deve conter de 4 a 6 dígitos numéricos.')
  }
}

async function gerarHash(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS)
}

// ───── Auth por usuário ───────────────────────────────────────────────

export async function verificarPin(usuarioId: number, pin: string): Promise<boolean> {
  const hash = obterAuthStore().obterPinHash(usuarioId)
  if (!hash) return false
  return bcrypt.compare(pin, hash)
}

export async function definirPin(usuarioId: number, pin: string): Promise<void> {
  validarFormatoPin(pin)
  const store = obterAuthStore()
  const u = store.obterUsuario(usuarioId)
  if (!u) throw new Error('Usuário não encontrado.')
  if (u.tem_pin === 1) {
    throw new Error('Este usuário já tem PIN definido. Use a opção de alterar.')
  }
  const hash = await gerarHash(pin)
  store.gravarPinHash(usuarioId, hash)
}

export async function alterarPin(
  usuarioId: number,
  pinAtual: string,
  pinNovo: string
): Promise<void> {
  validarFormatoPin(pinNovo)
  const ok = await verificarPin(usuarioId, pinAtual)
  if (!ok) throw new Error('PIN atual incorreto.')
  const hash = await gerarHash(pinNovo)
  obterAuthStore().gravarPinHash(usuarioId, hash)
}

// Usado pelo modal "elevar privilégio": qualquer dono ativo cujo PIN bate libera.
// Retorna o id do dono que autenticou (pra auditoria futura) ou null.
export async function verificarPinDono(pin: string): Promise<number | null> {
  const store = obterAuthStore()
  for (const u of store.listarParaLogin()) {
    if (u.papel !== 'dono' || u.tem_pin !== 1) continue
    const hash = store.obterPinHash(u.id)
    if (!hash) continue
    if (await bcrypt.compare(pin, hash)) return u.id
  }
  return null
}

// Indica se existe ao menos um dono ativo com PIN — usado pela tela de login
// pra decidir se mostra o fluxo de "primeiro acesso" no dono.
export function temPinConfigurado(): boolean {
  const store = obterAuthStore()
  return (
    store.contarDonosAtivos() > 0 &&
    store.listarParaLogin().some((u) => u.papel === 'dono' && u.tem_pin === 1)
  )
}

// ───── Recuperação de PIN por email ───────────────────────────────────

export type CodigoGerado = {
  usuarioId: number
  nome: string
  email: string
  codigo: string
}

// Gera e PERSISTE (com hash bcrypt) um código de 6 dígitos pro usuário ativo
// daquele email, válido por MINUTOS_VALIDADE_RECUPERACAO. Retorna o código em
// CLARO só pra quem chamou enviar por email — o código nunca fica salvo em
// claro. Retorna null se nenhum usuário ativo tem esse email.
export async function gerarCodigoRecuperacao(email: string): Promise<CodigoGerado | null> {
  const store = obterAuthStore()
  const usuario = store.obterUsuarioAtivoPorEmail(email)
  if (!usuario) return null
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const hash = await gerarHash(codigo)
  const expiraEm = new Date(Date.now() + MINUTOS_VALIDADE_RECUPERACAO * 60_000).toISOString()
  store.salvarCodigoRecuperacao(usuario.id, hash, expiraEm)
  return { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email, codigo }
}

// Valida o código e redefine o PIN do usuário. Retorna o usuarioId pra
// auto-login. Lança erro em: PIN novo inválido, usuário inexistente, sem código
// pendente, código expirado, código errado (conta tentativa; 3 erradas invalidam).
export async function redefinirComCodigo(
  email: string,
  codigo: string,
  novoPin: string
): Promise<number> {
  validarFormatoPin(novoPin)
  const store = obterAuthStore()
  const usuario = store.obterUsuarioAtivoPorEmail(email)
  if (!usuario) throw new Error('Não encontramos um usuário ativo com esse email.')

  const registro = store.obterCodigoRecuperacao(usuario.id)
  if (!registro) {
    throw new Error('Nenhum código pendente. Solicite um novo código.')
  }
  if (new Date(registro.expira_em).getTime() < Date.now()) {
    store.apagarCodigosRecuperacao(usuario.id)
    throw new Error('Código expirado. Solicite um novo código.')
  }
  if (registro.tentativas >= MAX_TENTATIVAS_RECUPERACAO) {
    store.apagarCodigosRecuperacao(usuario.id)
    throw new Error('Muitas tentativas. Solicite um novo código.')
  }

  const confere = await bcrypt.compare(codigo, registro.codigo_hash)
  if (!confere) {
    store.incrementarTentativasCodigo(registro.id)
    const restantes = MAX_TENTATIVAS_RECUPERACAO - (registro.tentativas + 1)
    if (restantes <= 0) {
      store.apagarCodigosRecuperacao(usuario.id)
      throw new Error('Código incorreto. Tentativas esgotadas — solicite um novo código.')
    }
    throw new Error(`Código incorreto. Você tem mais ${restantes} tentativa(s).`)
  }

  const hash = await gerarHash(novoPin)
  store.gravarPinHash(usuario.id, hash)
  store.apagarCodigosRecuperacao(usuario.id)
  return usuario.id
}

// ───── Auto-lock ──────────────────────────────────────────────────────

export function lerAutoLockMinutos(): number {
  const raw = lerConfig(CHAVE_AUTO_LOCK)
  const n = parseInt(raw, 10)
  return isNaN(n) ? 15 : n
}

export function setarAutoLockMinutos(minutos: number): void {
  // 0 = desativado. Demais valores são clampados em [15, 240].
  const n = Math.floor(minutos)
  const seguro = n <= 0 ? 0 : Math.max(15, Math.min(240, n))
  gravarConfig(CHAVE_AUTO_LOCK, String(seguro))
}
