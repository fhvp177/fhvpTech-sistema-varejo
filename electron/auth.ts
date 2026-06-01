import bcrypt from 'bcryptjs'
import { lerConfig, gravarConfig } from './backup/configBackup'
import {
  contarDonosAtivos,
  gravarPinHash,
  listarParaLogin,
  obterPinHash,
  obterVendedor
} from './db/queries/vendedores'

const CHAVE_AUTO_LOCK = 'auto_lock_minutos'
const CHAVE_TETO_DESCONTO = 'teto_desconto_vendedor_pct'
const BCRYPT_ROUNDS = 12

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
