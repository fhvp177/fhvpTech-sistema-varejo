import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import {
  contarDonosAtivos,
  gravarPinHash,
  listarParaLogin,
  obterPinHash,
  obterVendedor
} from './db/queries/vendedores'
import {
  apagarCodigosRecuperacao,
  incrementarTentativasCodigo,
  obterCodigoRecuperacao,
  obterUsuarioAtivoPorEmail,
  salvarCodigoRecuperacao
} from './db/queries/recuperacao'

const CHAVE_AUTO_LOCK = 'auto_lock_minutos'
const CHAVE_TETO_DESCONTO = 'teto_desconto_vendedor_pct'
const BCRYPT_ROUNDS = 12

// Recuperação de PIN do dono por email.
const MINUTOS_VALIDADE_RECUPERACAO = 15
const MAX_TENTATIVAS_RECUPERACAO = 3

// Aceita PIN de 4 a 6 dígitos numéricos
const REGEX_PIN = /^\d{4,6}$/

function validarFormatoPin(pin: string): void {
  if (!REGEX_PIN.test(pin)) {
    throw new Error('O PIN deve conter de 4 a 6 dígitos numéricos.')
  }
}

async function gerarHash(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS)
}

// ───── Auth por vendedor ─────────────────────────────────────────────

export async function verificarPinVendedor(
  vendedorId: number,
  pin: string
): Promise<boolean> {
  const hash = obterPinHash(vendedorId)
  if (!hash) return false
  return bcrypt.compare(pin, hash)
}

export async function definirPinVendedor(vendedorId: number, pin: string): Promise<void> {
  validarFormatoPin(pin)
  const v = obterVendedor(vendedorId)
  if (!v) throw new Error('Vendedor não encontrado.')
  if (v.tem_pin === 1) {
    throw new Error('Este vendedor já tem PIN definido. Use a opção de alterar.')
  }
  const hash = await gerarHash(pin)
  gravarPinHash(vendedorId, hash)
}

export async function alterarPinVendedor(
  vendedorId: number,
  pinAtual: string,
  pinNovo: string
): Promise<void> {
  validarFormatoPin(pinNovo)
  const ok = await verificarPinVendedor(vendedorId, pinAtual)
  if (!ok) throw new Error('PIN atual incorreto.')
  const hash = await gerarHash(pinNovo)
  gravarPinHash(vendedorId, hash)
}

// Usado pelo modal "elevar privilégio": qualquer dono ativo cujo PIN bate libera.
// Retorna o id do dono que autenticou (pra auditoria futura) ou null.
export async function verificarPinDono(pin: string): Promise<number | null> {
  for (const v of listarParaLogin()) {
    if (v.papel !== 'dono' || v.tem_pin !== 1) continue
    const hash = obterPinHash(v.id)
    if (!hash) continue
    if (await bcrypt.compare(pin, hash)) return v.id
  }
  return null
}

// Indica se existe ao menos um dono ativo com PIN — usado pela tela de login
// pra decidir se mostra o fluxo de "primeiro acesso" no dono.
export function temPinConfigurado(): boolean {
  return (
    contarDonosAtivos() > 0 &&
    listarParaLogin().some((v) => v.papel === 'dono' && v.tem_pin === 1)
  )
}

// ───── Recuperação de PIN do dono por email ───────────────────────────

export type CodigoGerado = {
  vendedorId: number
  nome: string
  email: string
  codigo: string
}

// Gera e PERSISTE (com hash bcrypt) um código de 6 dígitos pro usuário ativo
// (dono ou vendedor) daquele email, válido por MINUTOS_VALIDADE_RECUPERACAO.
// Retorna o código em CLARO só pra quem chamou enviar por email — o código
// nunca fica salvo em claro. Retorna null se nenhum usuário ativo tem esse
// email (anti-vazamento fica a cargo do chamador; num app local de loja,
// feedback claro vale mais).
export async function gerarCodigoRecuperacao(email: string): Promise<CodigoGerado | null> {
  const usuario = obterUsuarioAtivoPorEmail(email)
  if (!usuario) return null
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const hash = await gerarHash(codigo)
  const expiraEm = new Date(Date.now() + MINUTOS_VALIDADE_RECUPERACAO * 60_000).toISOString()
  salvarCodigoRecuperacao(usuario.id, hash, expiraEm)
  return { vendedorId: usuario.id, nome: usuario.nome, email: usuario.email, codigo }
}

// Valida o código e redefine o PIN do usuário. Retorna o vendedorId pra
// auto-login. Lança erro em: PIN novo inválido, usuário inexistente, sem código
// pendente, código expirado, código errado (conta tentativa; 3 erradas invalidam).
export async function redefinirComCodigo(
  email: string,
  codigo: string,
  novoPin: string
): Promise<number> {
  validarFormatoPin(novoPin)
  const usuario = obterUsuarioAtivoPorEmail(email)
  if (!usuario) throw new Error('Não encontramos um usuário ativo com esse email.')

  const registro = obterCodigoRecuperacao(usuario.id)
  if (!registro) {
    throw new Error('Nenhum código pendente. Solicite um novo código.')
  }
  if (new Date(registro.expira_em).getTime() < Date.now()) {
    apagarCodigosRecuperacao(usuario.id)
    throw new Error('Código expirado. Solicite um novo código.')
  }
  if (registro.tentativas >= MAX_TENTATIVAS_RECUPERACAO) {
    apagarCodigosRecuperacao(usuario.id)
    throw new Error('Muitas tentativas. Solicite um novo código.')
  }

  const confere = await bcrypt.compare(codigo, registro.codigo_hash)
  if (!confere) {
    incrementarTentativasCodigo(registro.id)
    const restantes = MAX_TENTATIVAS_RECUPERACAO - (registro.tentativas + 1)
    if (restantes <= 0) {
      apagarCodigosRecuperacao(usuario.id)
      throw new Error('Código incorreto. Tentativas esgotadas — solicite um novo código.')
    }
    throw new Error(`Código incorreto. Você tem mais ${restantes} tentativa(s).`)
  }

  const hash = await gerarHash(novoPin)
  gravarPinHash(usuario.id, hash)
  apagarCodigosRecuperacao(usuario.id)
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

// ───── Teto de desconto por vendedor ──────────────────────────────────
// Limite máximo de desconto (em %) que um vendedor pode aplicar sem PIN do dono.
// 0 = qualquer desconto exige PIN do dono. 100 = vendedor pode dar qualquer.

export function lerTetoDescontoPct(): number {
  const raw = lerConfig(CHAVE_TETO_DESCONTO)
  const n = parseFloat(raw)
  if (isNaN(n) || n < 0) return 10
  return Math.min(100, n)
}

export function setarTetoDescontoPct(pct: number): void {
  const n = Number(pct)
  if (isNaN(n) || n < 0 || n > 100) {
    throw new Error('O teto de desconto deve estar entre 0 e 100.')
  }
  // Guarda como string com até 2 casas pra evitar lixo flutuante
  gravarConfig(CHAVE_TETO_DESCONTO, String(Math.round(n * 100) / 100))
}
