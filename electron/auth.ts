import bcrypt from 'bcryptjs'
import { lerConfig, gravarConfig } from './backup/configBackup'

const CHAVE_HASH = 'pin_sistema_hash'
const CHAVE_AUTO_LOCK = 'auto_lock_minutos'
const CHAVE_ULTIMA_VALIDACAO = 'ultima_validacao_pin_data'
const BCRYPT_ROUNDS = 12

// Aceita PIN de 4 a 6 dígitos numéricos
const REGEX_PIN = /^\d{4,6}$/

function validarFormatoPin(pin: string): void {
  if (!REGEX_PIN.test(pin)) {
    throw new Error('O PIN deve conter de 4 a 6 dígitos numéricos.')
  }
}

function hojeIso(): string {
  // Data local em YYYY-MM-DD (ignora hora — "abertura do dia" é local, não UTC)
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

export function temPinConfigurado(): boolean {
  return !!lerConfig(CHAVE_HASH)
}

export async function verificarPin(pin: string): Promise<boolean> {
  const hash = lerConfig(CHAVE_HASH)
  if (!hash) return false
  return bcrypt.compare(pin, hash)
}

// Define o PIN pela primeira vez. Falha se já houver PIN configurado —
// para trocar use alterarPin (que exige o atual).
export async function definirPin(pin: string): Promise<void> {
  validarFormatoPin(pin)
  if (temPinConfigurado()) {
    throw new Error('Já existe um PIN configurado. Use a opção de alterar.')
  }
  const hash = await bcrypt.hash(pin, BCRYPT_ROUNDS)
  gravarConfig(CHAVE_HASH, hash)
}

export async function alterarPin(pinAtual: string, pinNovo: string): Promise<void> {
  validarFormatoPin(pinNovo)
  const ok = await verificarPin(pinAtual)
  if (!ok) throw new Error('PIN atual incorreto.')
  const hash = await bcrypt.hash(pinNovo, BCRYPT_ROUNDS)
  gravarConfig(CHAVE_HASH, hash)
}

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

// Registra que o PIN foi validado hoje — usado para não pedir de novo
// na mesma data caso o usuário reinicie o app por algum motivo.
export function marcarValidadoHoje(): void {
  gravarConfig(CHAVE_ULTIMA_VALIDACAO, hojeIso())
}

export function precisaValidarHoje(): boolean {
  if (!temPinConfigurado()) return false
  return lerConfig(CHAVE_ULTIMA_VALIDACAO) !== hojeIso()
}
