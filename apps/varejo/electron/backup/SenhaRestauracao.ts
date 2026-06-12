import bcrypt from 'bcryptjs'
import { lerConfig, gravarConfig } from './configBackup'

const CHAVE_HASH = 'backup_hash_senha_restauracao'
const BCRYPT_ROUNDS = 12

export function temSenhaConfigurada(): boolean {
  return !!lerConfig(CHAVE_HASH)
}

export async function verificarSenha(senha: string): Promise<boolean> {
  const hash = lerConfig(CHAVE_HASH)
  if (!hash) return false
  return bcrypt.compare(senha, hash)
}

// Apenas o script CLI usa esta função — não é exposta via IPC
export async function definirSenha(senha: string): Promise<void> {
  const hash = await bcrypt.hash(senha, BCRYPT_ROUNDS)
  gravarConfig(CHAVE_HASH, hash)
}
